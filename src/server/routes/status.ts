import { Hono } from "hono";
import { getStatus } from "../status.js";

const page = `<!doctype html>
<html lang="zh-CN"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>wxexporter · 公众号采集</title><style>
:root{font-family:system-ui,-apple-system,sans-serif;color:#18332e;background:#f3f6f3}*{box-sizing:border-box}body{margin:0}main{max-width:1000px;margin:60px auto;padding:0 24px}header{border-bottom:1px solid #ccd9d1;padding-bottom:28px}h1{font-size:36px;letter-spacing:-1px;margin:8px 0 16px}h2{font-size:19px;margin:0 0 14px}p{color:#52665e;line-height:1.8}a{color:#156751}small,.eyebrow{color:#61746b}.eyebrow{letter-spacing:3px;font-size:12px}.cards{display:grid;grid-template-columns:repeat(3,1fr);gap:16px;margin:28px 0}.card,section{background:white;border:1px solid #dce4dd;border-radius:12px;padding:24px}.value{font-size:22px;font-weight:650;margin-top:12px}section{margin:20px 0}.notice{border-left:4px solid #c4943b;background:#fff9ec}table{width:100%;border-collapse:collapse;font-size:14px}td,th{text-align:left;padding:14px 8px;border-bottom:1px solid #e8eee9}td.path{max-width:420px;overflow-wrap:anywhere}th{color:#6c7e73;font-weight:500}.ok{color:#156751}.error{color:#a95427}.table-wrap{overflow:auto}button{background:#156751;color:white;border:0;border-radius:8px;padding:10px 16px;cursor:pointer}footer{color:#74877b;font-size:12px;margin:30px 0}@media(max-width:640px){main{margin:32px auto}.cards{grid-template-columns:1fr}h1{font-size:28px}section{padding:18px}}
</style></head><body><main>
<header><span class="eyebrow">WXEXPORTER / CAPABILITY SERVICE</span><h1>公众号采集 · 运行状态</h1><p>为知识工作台提供公众号搜索、文章列表与正文导出能力。订阅、采集计划和文章归档由工作台管理。</p></header>
<div class="cards"><div class="card"><small>服务状态</small><div id="health" class="value">连接中</div></div><div class="card"><small>连续运行</small><div id="uptime" class="value">—</div></div><div class="card"><small>正文抓取引擎</small><div id="engine" class="value">—</div><small>按请求启动工作进程</small></div></div>
<section class="notice"><h2>微信接口受限时</h2><p>如果返回 <strong>200013 / freq control</strong>，表示微信拒绝了当前接口请求，不能据此判断登录已经过期。公众号搜索可用，也不代表文章列表可用。请减少请求并稍后手动重试，系统不会立即连续重试这个错误。</p></section>
<section><h2>最近请求</h2><p>显示本次进程启动后的最近 20 条请求。<button id="refresh" type="button">刷新状态</button></p><div class="table-wrap"><table><thead><tr><th>时间</th><th>请求</th><th>结果</th></tr></thead><tbody id="requests"></tbody></table></div><p id="empty" hidden>暂无请求记录。采集任务开始后会显示在这里。</p></section>
<section><h2>接口与工作台</h2><p>当前服务是从 wechat-article-exporter 提取的能力层，原项目的完整导出界面没有移植。微信扫码登录、订阅与任务操作请在 Knowledge Sync 的连接配置中完成。</p><a href="/status/json">查看状态 JSON</a></section>
<footer id="updated">每 15 秒更新一次 · 不显示登录密钥与 Cookie</footer>
</main><script>
async function refresh(){try{const response=await fetch('/status/json');if(!response.ok)throw new Error('status unavailable');const data=await response.json();document.getElementById('health').textContent='正常运行';document.getElementById('uptime').textContent=Math.floor(data.uptime_s/3600)+' 小时 '+Math.floor(data.uptime_s%3600/60)+' 分钟';document.getElementById('engine').textContent=data.workerStatus.engine;const body=document.getElementById('requests');body.replaceChildren();for(const row of data.recentRequests.slice().reverse()){const tr=document.createElement('tr');for(const [index,value] of [new Date(row.ts).toLocaleString('zh-CN'),row.url,row.status==='ok'?'成功':'失败'+(row.ret?' · '+row.ret:'')].entries()){const td=document.createElement('td');td.textContent=value;if(index===1)td.className='path';if(index===2)td.className=row.status;tr.append(td);}body.append(tr);}document.getElementById('empty').hidden=data.recentRequests.length>0;document.getElementById('updated').textContent='更新于 '+new Date().toLocaleTimeString('zh-CN')+' · 不显示登录密钥与 Cookie';}catch{document.getElementById('health').textContent='连接失败';}}
document.getElementById('refresh').addEventListener('click',refresh);refresh();setInterval(refresh,15000);
</script></body></html>`;

export const statusApp = new Hono();
statusApp.get("/json", (c) => c.json(getStatus()));
statusApp.get("/", (c) =>
  c.req.header("accept")?.includes("text/html")
    ? c.html(page)
    : c.json(getStatus()),
);
