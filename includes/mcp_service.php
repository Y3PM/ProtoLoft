<?php
require_once __DIR__ . '/mcp_access.php';
require_once __DIR__ . '/collaboration.php';
require_once __DIR__ . '/zip_handler.php';
require_once __DIR__ . '/webhook.php';
class McpDomainResult extends Exception {
    public $result;
    public function __construct($result) { $this->result = $result; parent::__construct('domain response'); }
}
class McpService {
    /** 文件截断可能切在中文字符中间；保证工具结果仍是有效 UTF-8 JSON。 */
    public static function cleanData($value) {
        if (is_string($value)) return PrototypeContext::utf8($value);
        if (is_array($value)) { foreach ($value as $key => $entry) $value[$key] = self::cleanData($entry); }
        return $value;
    }
    public static function guide() {
        return t('api.mcp.instructions');
    }
    private static function definition($name, $title, $description, $properties, $required = [], $write = false, $destructive = false) {
        return ['name' => $name, 'title' => $title, 'description' => $description,
            'inputSchema' => ['type' => 'object', 'properties' => $properties ?: new stdClass(), 'required' => $required, 'additionalProperties' => false],
            'annotations' => ['readOnlyHint' => !$write, 'destructiveHint' => $destructive, 'openWorldHint' => false]];
    }
    public static function tools($access) {
        $integer = ['type' => 'integer', 'minimum' => 1]; $string = ['type' => 'string'];
        $pagination = ['offset' => ['type'=>'integer','minimum'=>0], 'limit'=>['type'=>'integer','minimum'=>1,'maximum'=>100]];
        $tools = [
            self::definition('list_projects',t('api.mcp.tool_list_projects'),t('api.mcp.tool_list_projects_desc'),['query'=>$string]+$pagination),
            self::definition('list_versions',t('api.mcp.tool_list_versions'),t('api.mcp.tool_list_versions_desc'),['item_id'=>$integer],['item_id']),
            self::definition('list_pages',t('api.mcp.tool_list_pages'),t('api.mcp.tool_list_pages_desc'),['version_id'=>$integer]+$pagination,['version_id']),
            self::definition('read_page',t('api.mcp.tool_read_page'),t('api.mcp.tool_read_page_desc'),['version_id'=>$integer,'page_path'=>$string,'include_interactions'=>['type'=>'boolean']],['version_id','page_path']),
            self::definition('read_image',t('api.mcp.tool_read_image'),t('api.mcp.tool_read_image_desc'),['version_id'=>$integer,'path'=>$string],['version_id','path']),
            self::definition('read_annotations',t('api.mcp.tool_read_annotations'),t('api.mcp.tool_read_annotations_desc'),['version_id'=>$integer,'status'=>['type'=>'string','enum'=>['all','pending','resolved']]]+$pagination,['version_id'])
        ];
        if ((int)$access['can_publish'] && Auth::canManage()) {
            $tools[] = self::definition('resolve_annotation',t('api.mcp.tool_resolve_annotation'),t('api.mcp.tool_resolve_annotation_desc'),['annotation_id'=>$integer,'status'=>['type'=>'string','enum'=>['resolved','pending']],'comment'=>$string],['annotation_id'],true);
            $tools[] = self::definition('prepare_publish',t('api.mcp.tool_prepare_publish'),t('api.mcp.tool_prepare_publish_desc'),['item_id'=>$integer,'version_name'=>$string],['item_id','version_name']);
            $tools[] = self::definition('upload_chunk',t('api.mcp.tool_upload_chunk'),t('api.mcp.tool_upload_chunk_desc'),['item_id'=>$integer,'upload_id'=>['type'=>'string','pattern'=>'^[a-zA-Z0-9_-]{1,48}$'],'file_type'=>['type'=>'string','enum'=>['zip','rp']],'chunk_index'=>['type'=>'integer','minimum'=>0],'chunk_total'=>['type'=>'integer','minimum'=>1,'maximum'=>1000],'data_base64'=>$string],['item_id','upload_id','file_type','chunk_index','chunk_total','data_base64'],true);
            $tools[] = self::definition('publish_version',t('api.mcp.tool_publish_version'),t('api.mcp.tool_publish_version_desc'),['item_id'=>$integer,'version_name'=>$string,'zip_upload_id'=>$string,'rp_upload_id'=>$string,'changelog'=>$string,'notify_webhook'=>['type'=>'boolean'],'notify_item'=>['type'=>'boolean'],'notify_global'=>['type'=>'boolean'],'replace_existing'=>['type'=>'boolean'],'overwrite_token'=>$string],['item_id','version_name','zip_upload_id'],true,true);
        }
        return $tools;
    }
    private static function arguments($definition, $args) {
        if (!is_array($args)) throw new DomainException(t('api.mcp.tool_args_obj'));
        $schema = $definition['inputSchema'];
        foreach ($schema['required'] as $key) if (!array_key_exists($key,$args)) throw new DomainException(t('api.mcp.missing_param', ['key' => $key]));
        foreach ($args as $key=>$value) {
            if (!isset($schema['properties'][$key])) throw new DomainException(t('api.mcp.unknown_param', ['key' => $key]));
            $rule=$schema['properties'][$key];$type=$rule['type'];
            if (($type==='integer'&&!is_int($value))||($type==='string'&&!is_string($value))||($type==='boolean'&&!is_bool($value))) throw new DomainException(t('api.mcp.invalid_param_type', ['key' => $key]));
            if (isset($rule['minimum']) && $value<$rule['minimum'] || isset($rule['maximum']) && $value>$rule['maximum']) throw new DomainException(t('api.mcp.invalid_param_range', ['key' => $key]));
            if (isset($rule['enum'])&&!in_array($value,$rule['enum'],true)) throw new DomainException(t('api.mcp.invalid_param_val', ['key' => $key]));
            if (isset($rule['pattern'])&&!preg_match('#'.$rule['pattern'].'#D',$value)) throw new DomainException(t('api.mcp.invalid_param_fmt', ['key' => $key]));
        }
    }
    private static function domain($action, $fields) {
        $db=DB::getInstance(); $_POST=$fields; $_GET=$fields;
        try { require __DIR__.'/actions/versions.php'; }
        catch (McpDomainResult $response) {
            if (!$response->result['success']) throw new DomainException($response->result['message']);
            return (array)$response->result['data'] + ['message'=>$response->result['message']];
        }
        throw new RuntimeException(t('api.mcp.no_action_result'));
    }
    private static function chunkId($access, $itemId, $id) {
        if (!is_string($id)||!preg_match('/^[a-zA-Z0-9_-]{1,48}$/D',$id)) throw new DomainException(t('api.storage.invalid_upload_id'));
        return 'mcp_'.$access['id'].'_p'.(int)$itemId.'_'.$id;
    }
    public static function call($name, $args, $access) {
        $found=false;
        foreach (self::tools($access) as $definition) if ($definition['name']===$name) {$found=true;self::arguments($definition,$args);break;}
        if (!$found) throw new DomainException(t('api.mcp.tool_forbidden'));
        $db=DB::getInstance();$offset=$args['offset']??0;$limit=$args['limit']??50;
        if ($name==='list_projects') {
            $list=[];$query=mb_strtolower($args['query']??'', 'UTF-8');
            $allowed = [];
            if (!empty($access['project_ids'])) {
                $allowed = McpAccess::parseProjectIds($access['project_ids']);
            } elseif (!empty($access['project_id'])) {
                $allowed = [(int)$access['project_id']];
            }
            foreach ($db->query("SELECT * FROM items WHERE type='project' ORDER BY id DESC")->fetchAll() as $item) {
                if (!Auth::canViewItem($item)) continue;
                if (!empty($allowed) && !in_array((int)$item['id'], $allowed, true)) continue;
                if ($query!==''&&mb_strpos(mb_strtolower($item['name'],'UTF-8'),$query,0,'UTF-8')===false)continue;
                $list[]=['id'=>(int)$item['id'],'name'=>$item['name'],'can_publish'=>(bool)$access['can_publish']&&Auth::canEditItem($item)];
            }
            return ['projects'=>array_slice($list,$offset,$limit),'total'=>count($list),'next_offset'=>$offset+$limit<count($list)?$offset+$limit:null];
        }
        if (isset($args['version_id'])) {
            $version=PrototypeContext::version($args['version_id']);McpAccess::project($access,$version['item_id']);
        }
        if ($name==='list_versions') {
            McpAccess::project($access,$args['item_id']);
            $stmt=$db->prepare('SELECT id,version_name,is_default,changelog,author_name,created_at,updated_at FROM versions WHERE item_id=? ORDER BY is_default DESC,id DESC');$stmt->execute([$args['item_id']]);
            return ['versions'=>$stmt->fetchAll()];
        }
        if ($name==='list_pages') return PrototypeContext::pages($version,$offset,$limit);
        if ($name==='read_page') {
            $page=PrototypeContext::read($version,$args['page_path']);
            list($relative)=PrototypeContext::pageParts($args['page_path'],$version);
            $html=file_get_contents(Storage::filePath($version,$relative),false,null,0,1024*1024);
            preg_match_all('#<img\b[^>]*\bsrc=["\']([^"\']+)["\']#i',$html,$images);
            $refs=[];foreach(array_slice(array_unique($images[1]),0,100) as $src) {
                $ref=self::localReference($relative,html_entity_decode($src,ENT_QUOTES,'UTF-8'));
                if ($ref!==''&&Storage::filePath($version,$ref))$refs[]=$ref;
            }
            $page['images']=$refs;
            if (!empty($args['include_interactions'])) {
                preg_match_all('#<script\b[^>]*\bsrc=["\']([^"\']+)["\']#i',$html,$scripts);
                $sources=[];
                foreach ($scripts[1] as $src) {
                    $ref=self::localReference($relative,html_entity_decode($src,ENT_QUOTES,'UTF-8'));
                    if (!preg_match('#^files/.+/data\.js$#D',$ref))continue;
                    $path=Storage::filePath($version,$ref);
                    if ($path)$sources[]=['path'=>$ref,'source'=>file_get_contents($path,false,null,0,65536),'truncated'=>filesize($path)>65536];
                    if(count($sources)>=3)break;
                }
                $page['interaction_sources']=$sources;
            }
            return $page;
        }
        if ($name==='read_image') {
            $path=Storage::filePath($version,$args['path']);
            if(!$path||filesize($path)>2*1024*1024||!preg_match('/\.(png|jpe?g|gif|webp)$/iD',$path))throw new DomainException(t('api.mcp.img_invalid'));
            $info=@getimagesize($path);
            if(!$info||!in_array($info['mime'],['image/png','image/jpeg','image/gif','image/webp'],true))throw new DomainException(t('api.mcp.img_mime_invalid'));
            return ['__image'=>base64_encode(file_get_contents($path)),'mimeType'=>$info['mime']];
        }
        if ($name==='read_annotations') {
            if(!Auth::canAnnotate())throw new DomainException(t('api.mcp.no_read_anno'));
            $where='ver_id=?';$params=[$version['id']];$status=$args['status']??'all';
            if($status!=='all'){$where.=' AND status=?';$params[]=$status==='pending'?0:1;}
            $stmt=$db->prepare('SELECT * FROM annotations WHERE '.$where.' ORDER BY id DESC LIMIT '.(int)$limit.' OFFSET '.(int)$offset);$stmt->execute($params);
            $list=[];foreach($stmt->fetchAll() as $row){
                $reply=$db->prepare('SELECT author_name,content,created_at FROM annotation_replies WHERE annotation_id=? ORDER BY id LIMIT 100');$reply->execute([$row['id']]);
                $row['replies']=$reply->fetchAll();$row['replies_limit']=100;$list[]=Collaboration::decorate($row,$version);
            }
            $count=$db->prepare('SELECT COUNT(*) FROM annotations WHERE '.$where);$count->execute($params);$total=(int)$count->fetchColumn();
            return ['version_id'=>(int)$version['id'],'revision'=>PrototypeContext::revision($version),'list'=>$list,'total'=>$total,'next_offset'=>$offset+$limit<$total?$offset+$limit:null];
        }
        if ($name==='resolve_annotation') {
            if(!Auth::canAnnotate())throw new DomainException(t('api.anno.no_op_perm'));
            $annoId=(int)$args['annotation_id'];
            $stmt=$db->prepare('SELECT * FROM annotations WHERE id=?');$stmt->execute([$annoId]);
            $anno=$stmt->fetch();
            $stmt->closeCursor();
            if(!$anno)throw new DomainException(t('api.anno.not_found'));
            $item=Auth::getItem((int)$anno['item_id']);
            if(!$item||!Auth::canViewItem($item))throw new DomainException(t('api.anno.no_access'));
            McpAccess::project($access,$anno['item_id'],true);

            $targetStatus=($args['status']??'resolved')==='resolved'?1:0;
            $curUser=Auth::getCurrentUser();
            $resolverName=$targetStatus===1?(!empty($curUser['name'])?$curUser['name']:(!empty($curUser['email'])?$curUser['email']:t('api.mcp.ai_assistant'))):'';
            $resolvedAt=$targetStatus===1?gmdate('Y-m-d H:i:s'):null;

            $update=$db->prepare('UPDATE annotations SET status=?, resolved_by=?, resolved_at=? WHERE id=?');
            $update->execute([$targetStatus,$resolverName,$resolvedAt,$annoId]);

            $replyContent=trim($args['comment']??'');
            if($replyContent!=='') {
                $authorName=$resolverName?:t('api.mcp.ai_assistant');
                $authorDept=!empty($curUser['department'])?$curUser['department']:t('api.mcp.dept_default');
                $replyStmt=$db->prepare('INSERT INTO annotation_replies (annotation_id, user_id, author_name, author_dept, content) VALUES (?, ?, ?, ?, ?)');
                $replyStmt->execute([$annoId,(int)($curUser['id']??0),$authorName,$authorDept,$replyContent]);
            }

            if($targetStatus===1&&!empty($anno['user_id'])){
                try{
                    $uStmt=$db->prepare('SELECT webhook_url FROM users WHERE id=?');$uStmt->execute([(int)$anno['user_id']]);
                    $wbUrl=trim($uStmt->fetchColumn()?:'');
                    $uStmt->closeCursor();
                    if(!empty($wbUrl)){
                        Webhook::send($wbUrl,'annotation_resolve',[
                            'item_name'=>$item['name']??t('api.anno.default_item_name'),
                            'page_title'=>$anno['page_title']?:$anno['page_path'],
                            'author'=>$resolverName,
                            'content'=>$replyContent
                                ? t('api.anno.resolved_webhook_body_reply', ['content' => $anno['content'], 'reply' => $replyContent])
                                : t('api.anno.resolved_webhook_body', ['content' => $anno['content']]),
                            'link'=>Collaboration::link($annoId)
                        ]);
                    }
                }catch(Exception $e){}
            }

            return [
                'id'=>$annoId,
                'status'=>$targetStatus===1?'resolved':'pending',
                'resolved_by'=>$resolverName,
                'resolved_at'=>$resolvedAt,
                'comment'=>$replyContent
            ];
        }
        McpAccess::project($access,$args['item_id'],true);
        if($name==='prepare_publish')return self::domain('version_check_name',$args);
        if($name==='upload_chunk') {
            if(strlen($args['data_base64'])>1400000)throw new DomainException(t('api.mcp.chunk_over_1mb'));
            $bytes=base64_decode($args['data_base64'],true);
            if($bytes===false||strlen($bytes)<1||strlen($bytes)>1024*1024)throw new DomainException(t('api.mcp.chunk_invalid_1mb'));
            $id=self::chunkId($access,$args['item_id'],$args['upload_id']);
            $tmp=tempnam(CHUNKS_PATH,'mcp_part_');
            try {
                if(file_put_contents($tmp,$bytes)!==strlen($bytes))throw new RuntimeException(t('api.mcp.chunk_write_fail'));
                Storage::storeChunk($id,$args['file_type'],$args['chunk_index'],$args['chunk_total'],$tmp,(int)Auth::getCurrentUser()['id']);
            } finally {if(is_file($tmp))@unlink($tmp);}
            return ['upload_id'=>$args['upload_id'],'chunk_index'=>$args['chunk_index'],'chunk_total'=>$args['chunk_total']];
        }
        if($name==='publish_version') {
            $fields=$args;
            $fields['zip_upload_id']=self::chunkId($access,$args['item_id'],$args['zip_upload_id']);
            if(!empty($args['rp_upload_id']))$fields['rp_upload_id']=self::chunkId($access,$args['item_id'],$args['rp_upload_id']);
            if(empty($args['replace_existing']))$fields['overwrite_token']='';
            $fields['is_default']=1;
            if (isset($args['notify_item'])) $fields['notify_item'] = !empty($args['notify_item']) ? '1' : '0';
            if (isset($args['notify_global'])) $fields['notify_global'] = !empty($args['notify_global']) ? '1' : '0';
            if (isset($args['notify_webhook'])) $fields['notify_webhook'] = !empty($args['notify_webhook']) ? '1' : '0';
            $result=self::domain('version_publish',$fields);
            $result['preview_url']=app_url('index.php#item='.(int)$args['item_id'].'&vid='.(int)$result['id']);
            return $result;
        }
        throw new DomainException(t('api.mcp.unknown_tool'));
    }
    private static function localReference($page,$ref) {
        $ref=explode('#',explode('?',$ref,2)[0],2)[0];
        if($ref===''||preg_match('#^(?:[a-z][a-z0-9+.-]*:|/|\\\\)#i',$ref))return '';
        $parts=[];foreach(explode('/',dirname($page).'/'.rawurldecode($ref)) as $part){
            if($part===''||$part==='.')continue;
            if($part==='..'){if(!$parts)return '';array_pop($parts);}else{$parts[]=$part;}
        }
        return implode('/',$parts);
    }
}
