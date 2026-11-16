/* Independent official MCP SDK smoke test. SDK stays outside the repository.
 * node .dev/tests/mcp_client_smoke.mjs FIXTURE_JSON BASE_URL SDK_PACKAGE_DIR
 */
import fs from 'node:fs';
import path from 'node:path';
import {pathToFileURL} from 'node:url';
import {randomBytes} from 'node:crypto';
const [fixtureFile,base,sdkRoot]=process.argv.slice(2);
if(!fixtureFile||!base||!sdkRoot)throw new Error('Expected fixture JSON, base URL, external SDK package directory');
const fixture=JSON.parse(fs.readFileSync(fixtureFile,'utf8'));
const {Client}=await import(pathToFileURL(path.join(sdkRoot,'dist/esm/client/index.js')).href);
const {StreamableHTTPClientTransport}=await import(pathToFileURL(path.join(sdkRoot,'dist/esm/client/streamableHttp.js')).href);
let checks=0;const clients=[];
function check(label,value){if(!value)throw new Error(label);checks++;console.log('PASS '+label);}
async function connect(secret){
 const client=new Client({name:'protoloft-official-sdk-check',version:'1.0.0'});
 const transport=new StreamableHTTPClientTransport(new URL(base+'/mcp.php'),{requestInit:{headers:{Authorization:'Bearer '+secret}}});
 await client.connect(transport);clients.push(client);return client;
}
async function call(client,name,args){const result=await client.callTool({name,arguments:args});if(result.isError)throw new Error(name+': '+result.content?.[0]?.text);return result.structuredContent;}
try {
 const reader=await connect(fixture.reader);
 check('official SDK completes initialization',reader.getServerVersion().name==='protoloft');
 const tools=await reader.listTools();check('official SDK discovers read tools',tools.tools.length===6);
 const versions=await call(reader,'list_versions',{item_id:fixture.item});check('official SDK reads authorized versions',versions.versions.length>=2);
 const pages=await call(reader,'list_pages',{version_id:fixture.v1});check('official SDK reads page directory',pages.pages.some(p=>p.path==='section/index.html'));
 const page=await call(reader,'read_page',{version_id:fixture.v1,page_path:'index.html',include_interactions:true});check('official SDK reads source context with limits',page.text.includes('Changed same name')&&page.coverage.includes('未执行'));
 const notes=await call(reader,'read_annotations',{version_id:fixture.v1,status:'pending'});check('official SDK reads comments with snapshot',notes.list.some(n=>n.content==='Review original page'&&n.page_snapshot.includes('Original page')));
 const resources=await reader.listResources();const guide=await reader.readResource({uri:resources.resources[0].uri});check('official SDK reads integration instructions',guide.contents[0].text.includes('发布流程'));
 const prompts=await reader.listPrompts();const prompt=await reader.getPrompt({name:prompts.prompts[0].name,arguments:{project:'Prototype Project'}});check('official SDK reads test-case prompt',prompt.messages[0].content.text.includes('待确认'));
 const image=await reader.callTool({name:'read_image',arguments:{version_id:fixture.v1,path:'images/pixel.png'}});check('official SDK accepts native image content',image.content[0].type==='image');
 const writer=await connect(fixture.writer);check('official SDK discovers publish tools',(await writer.listTools()).tools.length===9);
 const name='SDK 验收 '+randomBytes(3).toString('hex');
 const pre=await call(writer,'prepare_publish',{item_id:fixture.item,version_name:name});check('official SDK preflights a free-form name',!pre.exists);
 const bytes=fs.readFileSync(path.join(path.dirname(fixtureFile),'fixture-prototype.zip'));
 let uploadId=randomBytes(16).toString('hex');await call(writer,'upload_chunk',{item_id:fixture.item,upload_id:uploadId,file_type:'zip',chunk_index:0,chunk_total:1,data_base64:bytes.toString('base64')});
 const published=await call(writer,'publish_version',{item_id:fixture.item,version_name:name,zip_upload_id:uploadId,changelog:'Official SDK validation'});check('official SDK uploads and publishes a prototype',published.id>0&&published.preview_url.startsWith(base));
 const replace=await call(writer,'prepare_publish',{item_id:fixture.item,version_name:name});uploadId=randomBytes(16).toString('hex');
 await call(writer,'upload_chunk',{item_id:fixture.item,upload_id:uploadId,file_type:'zip',chunk_index:0,chunk_total:1,data_base64:bytes.toString('base64')});
 const denied=await writer.callTool({name:'publish_version',arguments:{item_id:fixture.item,version_name:name,zip_upload_id:uploadId}});check('official SDK sees explicit replacement refusal',denied.isError);
 const replaced=await call(writer,'publish_version',{item_id:fixture.item,version_name:name,zip_upload_id:uploadId,replace_existing:true,overwrite_token:replace.overwrite_token});check('official SDK replaces only after confirmation',replaced.id===published.id);
 console.log(JSON.stringify({passed:checks,scope:'official @modelcontextprotocol/sdk 1.26.0, no model calls'}));
} catch(error){console.error('SDK smoke failed: '+error.message);process.exitCode=1;}
finally {for(const client of clients)await client.close();}
