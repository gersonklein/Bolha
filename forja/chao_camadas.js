// Receita espacial do chão. Saída: retângulos planos [x0,z0,x1,z1,cls,v],
// reproduzidos em ForjaLayout.gd para a mesma semente e classificação.
const limite = (v, a, b) => Math.max(a, Math.min(b, v));
const hash = (i, j, k) => { let x = (Math.imul(i, 374761393) + Math.imul(j, 668265263) + Math.imul(k, 1442695041)) | 0;
  x = Math.imul(x ^ (x >>> 13), 1274126177); return ((x ^ (x >>> 16)) >>> 0) / 4294967295; };
const cruza = (a, b) => ({ x0: Math.max(a.x0, b.x0), z0: Math.max(a.z0, b.z0), x1: Math.min(a.x1, b.x1), z1: Math.min(a.z1, b.z1) });
const valido = q => q.x1 - q.x0 > .018 && q.z1 - q.z0 > .018;
const quad = (q, c, out, clip) => { const p = cruza(q, clip); if (valido(p) && out.length < 5000) out.push([p.x0, p.z0, p.x1, p.z1, c.cls || 'PD', c.v ?? .5]); };
const faixa = (area, c, out, clip) => { const x = c.referencia === 'eixo' || c.referencia === 'centro' ? (area.x0 + area.x1) / 2 : 0;
  const z = (area.z0 + area.z1) / 2, vertical = area.z1 - area.z0 >= area.x1 - area.x0, w = limite(Number(c.largura ?? .12), .03, 3), off = Number(c.distancia ?? 0);
  const a = vertical ? {x0:x+off-w/2,z0:area.z0,x1:x+off+w/2,z1:area.z1} : {x0:area.x0,z0:z+off-w/2,x1:area.x1,z1:z+off+w/2};
  const tr = +c.traco || 0, gap = +c.vao || 0;
  if (tr <= 0 || gap <= 0) { quad(a,c,out,clip); return; }
  const start = vertical ? a.z0 : a.x0, end = vertical ? a.z1 : a.x1, step = limite(tr,.1,10) + limite(gap,.05,10);
  for (let t = Math.floor(start/step)*step; t < end && out.length < 5000; t += step) quad(vertical ? {...a,z0:t,z1:t+tr} : {...a,x0:t,x1:t+tr},c,out,clip);
};
const borda = (area,c,out,clip,seed) => { const w = limite(Number(c.largura ?? .5),.1,2), step = .25, n = Math.ceil(w/step), dens = limite(c.densidade ?? 1,0,1);
  for (let j=0;j<n;j++) { const d0=j*step,d1=Math.min(w,(j+1)*step), chance=dens*(1-d0/w);
    for (let t=area.x0;t<area.x1;t+=step) for (let side=0;side<2;side++) if (hash(Math.round(t*4),j+side*37,seed)<chance)
      quad({x0:t,z0:side ? area.z1-d1 : area.z0+d0,x1:t+step,z1:side ? area.z1-d0 : area.z0+d1},c,out,clip);
    for (let t=area.z0;t<area.z1;t+=step) for (let side=0;side<2;side++) if (hash(Math.round(t*4)+113,j+side*37,seed)<chance)
      quad({x0:side ? area.x1-d1 : area.x0+d0,z0:t,x1:side ? area.x1-d0 : area.x0+d1,z1:t+step},c,out,clip);
  }
};
const parede = (area,c,out,clip,seed,paredes) => { const w=limite(Number(c.largura??.5),.1,2), dens=limite(c.densidade??1,0,1), rec=cruza(area,clip);
  for (const p of paredes) { const rot=((Math.round(p.rot||0)%180)+180)%180; if (rot!==0 && rot!==90) continue;
    const horiz=rot===0, lo=(horiz?p.x:p.z)-p.comp/2, hi=lo+p.comp, fix=horiz?p.z:p.x;
    for (let t=Math.floor(lo*4)/4;t<hi;t+=.25) for (let j=0;j<Math.ceil(w/.25);j++) for (let side=0;side<2;side++) {
      const d0=j*.25,d1=Math.min(w,(j+1)*.25), chance=dens*(1-d0/w);
      if (hash(Math.round(t*4)+side*113,j,seed+53)<chance) {
        const a=horiz ? {x0:Math.max(lo,t),z0:fix+(side?d0:-d1),x1:Math.min(hi,t+.25),z1:fix+(side?d1:-d0)}
                      : {x0:fix+(side?d0:-d1),z0:Math.max(lo,t),x1:fix+(side?d1:-d0),z1:Math.min(hi,t+.25)};
        quad(a,c,out,rec);
      }
    }
  }
};
const principal = (area,c,out,clip,seed,instancias,roles) => { const w=limite(Number(c.largura??.8),.2,3), dens=limite(c.densidade??.8,0,1), rec=cruza(area,clip);
  for (const p of instancias) { if (roles[p.elemento]!=='principal' || p.x<area.x0 || p.x>area.x1 || p.z<area.z0 || p.z>area.z1) continue;
    for (let x=Math.floor((p.x-w)*4)/4;x<p.x+w;x+=.25) for (let z=Math.floor((p.z-w)*4)/4;z<p.z+w;z+=.25) {
      const d=Math.hypot((x+.125-p.x)/w,(z+.125-p.z)/w); if (d>=1 || hash(Math.round(x*4),Math.round(z*4),seed+71)>dens*(1-d*d)) continue;
      quad({x0:x,z0:z,x1:x+.25,z1:z+.25},c,out,rec);
    }
  }
};
export function camadasChao(L, funcoes = []) {
  const out=[], clip={x0:-L.largura/2,z0:-L.profundidade/2,x1:L.largura/2,z1:L.profundidade/2}, por=Object.fromEntries(funcoes.map(f=>[f.id,f.chao?.camadas || []])), roles=Object.fromEntries(funcoes.map(f=>[f.id,f.els || {}])), seed=L.semente || 1;
  const aplicar=(area,camadas,papeis={}) => { for (const c of camadas.slice(0,8)) { if (c.forma==='faixa' && ['eixo','centro'].includes(c.referencia)) faixa(area,c,out,clip);
    else if (c.forma==='acumulo' && c.referencia==='borda') borda(area,c,out,clip,seed);
    else if (c.forma==='acumulo' && c.referencia==='parede') parede(area,c,out,clip,seed,L.paredes || []);
    else if (c.forma==='acumulo' && c.referencia==='principal') principal(area,c,out,clip,seed,L.instancias || [],papeis);
    else if (c.forma==='faixa' && c.referencia==='porta') for (const p of L.portas || []) if (p.x>=area.x0-.2 && p.x<=area.x1+.2 && p.z>=area.z0-.2 && p.z<=area.z1+.2) {
      const w=limite(Number(c.largura??.22),.04,.7), h=p.larg/2;
      quad(p.rot===0 ? {x0:p.x-h,z0:p.z-w/2,x1:p.x+h,z1:p.z+w/2} : {x0:p.x-w/2,z0:p.z-h,x1:p.x+w/2,z1:p.z+h},c,out,clip); } } };
  for (const s of L.salas || []) aplicar(s,por[s.funcao] || [],roles[s.funcao]);
  const via=por.rua?.length ? por.rua : [{referencia:'eixo',forma:'faixa',largura:.12,traco:2,vao:2,cls:'AC',v:.7},{referencia:'borda',forma:'acumulo',largura:.6,densidade:.65,cls:'PD',v:.42}];
  for (const a of L.faixas || []) if (a[4]==='via') aplicar({x0:a[0],z0:a[1],x1:a[2],z1:a[3]},via);
  return out;
}
