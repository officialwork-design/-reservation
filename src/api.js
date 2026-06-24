import { CONFIG } from './config.js';

export async function apiGet(action, params = {}) {
 const url = new URL(CONFIG.GAS_URL);
 url.searchParams.set('action', action);
 Object.entries(params).forEach(([k,v])=>url.searchParams.set(k,v));
 const res = await fetch(url);
 if(!res.ok) throw new Error('API GET ERROR');
 return await res.json();
}

export async function apiPost(action, body={}){
 const url = `${CONFIG.GAS_URL}?action=${action}`;
 const res = await fetch(url,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)});
 if(!res.ok) throw new Error('API POST ERROR');
 return await res.json();
}
