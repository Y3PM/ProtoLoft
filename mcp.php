<?php
/** Stateless Streamable HTTP MCP endpoint; protocol 2025-11-25. */
require_once __DIR__.'/includes/config.php';
if (session_status() === PHP_SESSION_ACTIVE) session_write_close();
// 浏览器说明页与 MCP 协议复用入口，视图保留在不可直读的内部目录。
$method=$_SERVER['REQUEST_METHOD']??'GET';
if($method==='GET'&&((($_GET['guide']??'')==='1')||strpos($_SERVER['HTTP_ACCEPT']??'','text/html')!==false)) {
    header('Content-Type: text/html; charset=utf-8');
    header('Cache-Control: no-store');
    header('X-Content-Type-Options: nosniff');
    require __DIR__.'/includes/views/mcp-guide.php';
    exit;
}
header('Content-Type: application/json; charset=utf-8');
header('Cache-Control: no-store');header('X-Content-Type-Options: nosniff');
function rpc_error($id,$code,$message,$http=200) {
    http_response_code($http);echo json_encode(['jsonrpc'=>'2.0','id'=>$id,'error'=>['code'=>$code,'message'=>$message]],JSON_UNESCAPED_UNICODE);exit;
}
if(!is_installed())rpc_error(null,-32000,t('api.mcp.not_installed'),503);
// 客户端通常不发送 Origin；浏览器发送时必须与当前访问或配置的公开基准地址同源。
if(!empty($_SERVER['HTTP_ORIGIN'])) {
    $origin=parse_url($_SERVER['HTTP_ORIGIN']);
    $candidates=[parse_url(app_request_origin_url()),parse_url(app_url())];
    $originOk=false;
    if($origin) {
        $oScheme=strtolower($origin['scheme']??'');
        $oPort=(int)($origin['port']??($oScheme==='https'?443:80));
        foreach($candidates as $expected) {
            if(!$expected) continue;
            $eScheme=strtolower($expected['scheme']??'');
            $ePort=(int)($expected['port']??($eScheme==='https'?443:80));
            if($oScheme===$eScheme&&strcasecmp($origin['host']??'',$expected['host']??'')===0&&$oPort===$ePort) {
                $originOk=true;break;
            }
        }
    }
    if(!$originOk)rpc_error(null,-32000,t('api.mcp.origin_forbidden'),403);
}
define('MCP_REQUEST',true);
require_once __DIR__.'/includes/mcp_service.php';
function jsonResponse($success,$data=null,$message='') {throw new McpDomainResult(['success'=>$success,'data'=>$data,'message'=>$message]);}
try {$access=McpAccess::authenticate();}
catch(DomainException $e){header('WWW-Authenticate: Bearer realm="ProtoLoft MCP"');rpc_error(null,-32001,$e->getMessage(),401);}
catch(Throwable $e){error_log('[protoloft-mcp] '.$e->getMessage());rpc_error(null,-32603,t('api.mcp.unavailable'),503);}
if($method!=='POST'){header('Allow: POST');rpc_error(null,-32000,t('api.mcp.post_only'),405);}
if(stripos($_SERVER['CONTENT_TYPE']??'','application/json')!==0)rpc_error(null,-32600,t('api.mcp.need_json'),415);
$stream=fopen('php://input','rb');$body=stream_get_contents($stream,2*1024*1024+1);fclose($stream);
if(strlen($body)>2*1024*1024)rpc_error(null,-32600,t('api.mcp.body_too_large'),413);
$request=json_decode($body,true,64,JSON_BIGINT_AS_STRING);
if(json_last_error()!==JSON_ERROR_NONE)rpc_error(null,-32700,t('api.mcp.json_parse_fail'),400);
if(!is_array($request)||($request['jsonrpc']??'')!=='2.0'||!isset($request['method'])||!is_string($request['method']))rpc_error(null,-32600,t('api.mcp.invalid_req'),400);
$id=$request['id']??null;
if($id!==null&&!is_string($id)&&!is_int($id))rpc_error(null,-32600,t('api.mcp.invalid_id'),400);
$rpc=$request['method'];$params=$request['params']??[];
if(!is_array($params))rpc_error($id,-32602,t('api.mcp.params_obj'),400);
// 现代客户端探测后可以回退到明确支持的 2025-11-25 握手。
if($rpc==='server/discover')rpc_error($id,-32601,t('api.mcp.use_initialize'),404);
$protocol=$_SERVER['HTTP_MCP_PROTOCOL_VERSION']??'2025-11-25';
if(!in_array($protocol,['2025-03-26','2025-06-18','2025-11-25'],true))rpc_error($id,-32600,t('api.mcp.unsupported_protocol'),400);
if($id===null){
    if(in_array($rpc,['notifications/initialized','notifications/cancelled'],true)){http_response_code(202);exit;}
    rpc_error(null,-32600,t('api.mcp.tool_needs_id'),400);
}
try {
    if($rpc==='initialize') {
        $requested=$params['protocolVersion']??'2025-11-25';
        $negotiated=in_array($requested,['2025-03-26','2025-06-18','2025-11-25'],true)?$requested:'2025-11-25';
        $result=['protocolVersion'=>$negotiated,'capabilities'=>['tools'=>['listChanged'=>false],'prompts'=>['listChanged'=>false],'resources'=>['subscribe'=>false,'listChanged'=>false]],
            'serverInfo'=>['name'=>'protoloft','version'=>APP_VERSION],'instructions'=>McpService::guide()];
    } elseif($rpc==='ping')$result=new stdClass();
    elseif($rpc==='tools/list')$result=['tools'=>McpService::tools($access)];
    elseif($rpc==='tools/call') {
        try {
            if(!isset($params['name'])||!is_string($params['name']))throw new DomainException(t('api.mcp.missing_tool_name'));
            $data=McpService::cleanData(McpService::call($params['name'],$params['arguments']??[],$access));
            if(isset($data['__image']))$result=['content'=>[['type'=>'image','data'=>$data['__image'],'mimeType'=>$data['mimeType']]],'isError'=>false];
            else $result=['content'=>[['type'=>'text','text'=>json_encode($data,JSON_UNESCAPED_UNICODE|JSON_UNESCAPED_SLASHES)]],'structuredContent'=>$data,'isError'=>false];
        } catch(DomainException $e){$result=['content'=>[['type'=>'text','text'=>$e->getMessage()]],'isError'=>true];}
    } elseif($rpc==='resources/list')$result=['resources'=>[['uri'=>'protoloft://guide','name'=>t('api.mcp.guide_resource_name'),'mimeType'=>'text/plain']]];
    elseif($rpc==='resources/read') {
        if(($params['uri']??'')!=='protoloft://guide')throw new DomainException(t('api.mcp.resource_missing'));
        $result=['contents'=>[['uri'=>'protoloft://guide','mimeType'=>'text/plain','text'=>McpService::guide()]]];
    } elseif($rpc==='prompts/list')$result=['prompts'=>[['name'=>'prototype_test_cases','description'=>t('api.mcp.prompt_name_desc'),'arguments'=>[['name'=>'project','required'=>true],['name'=>'version','required'=>false]]]]];
    elseif($rpc==='prompts/get') {
        if(($params['name']??'')!=='prototype_test_cases')throw new DomainException(t('api.mcp.prompt_missing'));
        $args=$params['arguments']??[];
        if(!is_array($args)||!is_string($args['project']??null)||!is_string($args['version']??''))throw new DomainException(t('api.mcp.prompt_args_req'));
        $verLabel = ($args['version'] !== '') ? $args['version'] : t('api.mcp.prompt_default_ver');
        $result=['description'=>t('api.mcp.prompt_title'),'messages'=>[['role'=>'user','content'=>['type'=>'text','text'=>t('api.mcp.prompt_user_text', ['project' => $args['project'], 'version' => $verLabel]).McpService::guide()]]]];
    } else rpc_error($id,-32601,t('api.mcp.method_not_found'));
    echo json_encode(['jsonrpc'=>'2.0','id'=>$id,'result'=>$result],JSON_UNESCAPED_UNICODE|JSON_UNESCAPED_SLASHES);
} catch(DomainException $e){rpc_error($id,-32602,$e->getMessage());}
catch(Throwable $e){error_log('[protoloft-mcp] '.$e->getMessage());rpc_error($id,-32603,t('api.mcp.retry_op'));}
