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
if(!is_installed())rpc_error(null,-32000,'平台尚未安装',503);
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
    if(!$originOk)rpc_error(null,-32000,'不允许此来源',403);
}
define('MCP_REQUEST',true);
require_once __DIR__.'/includes/mcp_service.php';
function jsonResponse($success,$data=null,$message='') {throw new McpDomainResult(['success'=>$success,'data'=>$data,'message'=>$message]);}
try {$access=McpAccess::authenticate();}
catch(DomainException $e){header('WWW-Authenticate: Bearer realm="ProtoLoft MCP"');rpc_error(null,-32001,$e->getMessage(),401);}
catch(Throwable $e){error_log('[protoloft-mcp] '.$e->getMessage());rpc_error(null,-32603,'MCP 暂不可用',503);}
if($method!=='POST'){header('Allow: POST');rpc_error(null,-32000,'此端点仅接受 MCP POST 请求',405);}
if(stripos($_SERVER['CONTENT_TYPE']??'','application/json')!==0)rpc_error(null,-32600,'需要 application/json',415);
$stream=fopen('php://input','rb');$body=stream_get_contents($stream,2*1024*1024+1);fclose($stream);
if(strlen($body)>2*1024*1024)rpc_error(null,-32600,'请求超过2MB，请分片上传',413);
$request=json_decode($body,true,64,JSON_BIGINT_AS_STRING);
if(json_last_error()!==JSON_ERROR_NONE)rpc_error(null,-32700,'JSON 解析失败',400);
if(!is_array($request)||($request['jsonrpc']??'')!=='2.0'||!isset($request['method'])||!is_string($request['method']))rpc_error(null,-32600,'无效 MCP 请求',400);
$id=$request['id']??null;
if($id!==null&&!is_string($id)&&!is_int($id))rpc_error(null,-32600,'请求ID无效',400);
$rpc=$request['method'];$params=$request['params']??[];
if(!is_array($params))rpc_error($id,-32602,'参数必须为对象',400);
// 现代客户端探测后可以回退到明确支持的 2025-11-25 握手。
if($rpc==='server/discover')rpc_error($id,-32601,'支持 MCP 2025-11-25，请使用 initialize',404);
$protocol=$_SERVER['HTTP_MCP_PROTOCOL_VERSION']??'2025-11-25';
if(!in_array($protocol,['2025-03-26','2025-06-18','2025-11-25'],true))rpc_error($id,-32600,'不支持此协议版本，请使用 2025-11-25',400);
if($id===null){
    if(in_array($rpc,['notifications/initialized','notifications/cancelled'],true)){http_response_code(202);exit;}
    rpc_error(null,-32600,'工具调用必须包含请求ID',400);
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
            if(!isset($params['name'])||!is_string($params['name']))throw new DomainException('缺少工具名称');
            $data=McpService::cleanData(McpService::call($params['name'],$params['arguments']??[],$access));
            if(isset($data['__image']))$result=['content'=>[['type'=>'image','data'=>$data['__image'],'mimeType'=>$data['mimeType']]],'isError'=>false];
            else $result=['content'=>[['type'=>'text','text'=>json_encode($data,JSON_UNESCAPED_UNICODE|JSON_UNESCAPED_SLASHES)]],'structuredContent'=>$data,'isError'=>false];
        } catch(DomainException $e){$result=['content'=>[['type'=>'text','text'=>$e->getMessage()]],'isError'=>true];}
    } elseif($rpc==='resources/list')$result=['resources'=>[['uri'=>'protoloft://guide','name'=>'接入与协作指南','mimeType'=>'text/plain']]];
    elseif($rpc==='resources/read') {
        if(($params['uri']??'')!=='protoloft://guide')throw new DomainException('资源不存在');
        $result=['contents'=>[['uri'=>'protoloft://guide','mimeType'=>'text/plain','text'=>McpService::guide()]]];
    } elseif($rpc==='prompts/list')$result=['prompts'=>[['name'=>'prototype_test_cases','description'=>'根据指定原型和批注编写有出处的测试用例','arguments'=>[['name'=>'project','required'=>true],['name'=>'version','required'=>false]]]]];
    elseif($rpc==='prompts/get') {
        if(($params['name']??'')!=='prototype_test_cases')throw new DomainException('提示模板不存在');
        $args=$params['arguments']??[];
        if(!is_array($args)||!is_string($args['project']??null)||!is_string($args['version']??''))throw new DomainException('请指定项目，可选版本');
        $result=['description'=>'原型测试用例','messages'=>[['role'=>'user','content'=>['type'=>'text','text'=>'请查找项目「'.$args['project'].'」，版本「'.($args['version']??'默认版本').'」。读取页面和未解决批注，按模块、前置条件、步骤、预期、原型/批注依据、待确认规则整理测试用例。覆盖可观察到的正常及异常流程，未表达的业务规则列待确认，不要写成已执行测试。'.McpService::guide()]]]];
    } else rpc_error($id,-32601,'方法不存在');
    echo json_encode(['jsonrpc'=>'2.0','id'=>$id,'result'=>$result],JSON_UNESCAPED_UNICODE|JSON_UNESCAPED_SLASHES);
} catch(DomainException $e){rpc_error($id,-32602,$e->getMessage());}
catch(Throwable $e){error_log('[protoloft-mcp] '.$e->getMessage());rpc_error($id,-32603,'操作未完成，请重试');}
