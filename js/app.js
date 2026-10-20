/* Férias e banco de horas — lógica do app */

/* ===== Valores iniciais (edite aqui) ===== */
var PADRAO = {
  titulo: 'Controle de horas',
  fimData: '2027-01-15', fimHora: '17:30',
  jornada: { e1: '07:30', s1: '12:00', e2: '13:12', s2: '17:30' },
  dias: [false, true, true, true, true, true, false], // dom, seg, ter, qua, qui, sex, sáb
  banco: true,
  destino: 'Carazinho/RS', feriasIni: '2027-01-18', feriasFim: '2027-01-31'
};
var CHAVE = 'ferias-banco-v1';

var DS_CURTO = ['dom.', 'seg.', 'ter.', 'qua.', 'qui.', 'sex.', 'sáb.'];
var DS_LONGO = ['domingo', 'segunda-feira', 'terça-feira', 'quarta-feira', 'quinta-feira', 'sexta-feira', 'sábado'];
var DS_BTN = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'];
var MESES = ['janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho', 'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro'];
var CAMPOS = ['e1', 's1', 'e2', 's2'];

/* ===== Utilitários ===== */
function $(id) { return document.getElementById(id); }
function pad(n) { return String(n).padStart(2, '0'); }
function paraMin(t) { if (!t || !/^\d{1,2}:\d{2}/.test(t)) return null; var p = t.split(':'); return +p[0] * 60 + +p[1]; }
function iso(d) { return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate()); }
function lerData(s) { if (!s || !/^\d{4}-\d{2}-\d{2}$/.test(s)) return null; var p = s.split('-').map(Number); return new Date(p[0], p[1] - 1, p[2]); }
function dataCurta(d) { return DS_CURTO[d.getDay()] + ', ' + pad(d.getDate()) + '/' + pad(d.getMonth() + 1); }
function hm(min, comSinal) {
  var neg = min < 0, a = Math.abs(Math.round(min));
  var s = pad(Math.floor(a / 60)) + ':' + pad(a % 60);
  return comSinal ? (neg ? '−' : '+') + s : (neg ? '−' : '') + s;
}
function hms(ms) {
  var neg = ms < 0, t = Math.floor(Math.abs(ms) / 1000);
  return (neg ? '−' : '') + pad(Math.floor(t / 3600)) + ':' + pad(Math.floor(t % 3600 / 60)) + ':' + pad(t % 60);
}
function lerSaldo(s) {
  var m = /^\s*([+\-−]?)\s*(\d{1,4}):(\d{2})\s*$/.exec(s || '');
  if (!m || +m[3] > 59) return null;
  var v = +m[2] * 60 + +m[3];
  return (m[1] === '-' || m[1] === '−') ? -v : v;
}

/* ===== Estado salvo no navegador ===== */
var estado = carregar();
var diaSel = iso(new Date());

function carregar() {
  var s = null;
  try { s = JSON.parse(localStorage.getItem(CHAVE)); } catch (e) {}
  s = s || {};
  var cfg = Object.assign({}, PADRAO, s.cfg || {});
  cfg.jornada = Object.assign({}, PADRAO.jornada, (s.cfg && s.cfg.jornada) || {});
  if (!Array.isArray(cfg.dias) || cfg.dias.length !== 7) cfg.dias = PADRAO.dias.slice();
  return { cfg: cfg, lancamentos: s.lancamentos || {}, ajuste: typeof s.ajuste === 'number' ? s.ajuste : 0 };
}
function salvar() { try { localStorage.setItem(CHAVE, JSON.stringify(estado)); } catch (e) {} }

/* ===== Cálculos ===== */
function periodos(j) {
  var out = [];
  [[j.e1, j.s1], [j.e2, j.s2]].forEach(function (p) {
    var a = paraMin(p[0]), b = paraMin(p[1]);
    if (a != null && b != null && b > a) out.push([a, b]);
  });
  return out;
}
function jornadaMin(j) { return periodos(j).reduce(function (s, p) { return s + p[1] - p[0]; }, 0); }
function fimTs(cfg) {
  var d = lerData(cfg.fimData), m = paraMin(cfg.fimHora);
  return d ? new Date(d.getFullYear(), d.getMonth(), d.getDate(), 0, m || 0).getTime() : null;
}
// Soma o tempo de trabalho entre agora e o fim do expediente
function restante(agora, fim, cfg) {
  var per = periodos(cfg.jornada), total = 0, dentro = false, dias = 0;
  var d = new Date(agora); d.setHours(0, 0, 0, 0);
  for (var g = 0; d.getTime() <= fim && g < 4000; g++) {
    if (cfg.dias[d.getDay()]) {
      var contou = false;
      per.forEach(function (p) {
        var ini = new Date(d.getFullYear(), d.getMonth(), d.getDate(), 0, p[0]).getTime();
        var f = new Date(d.getFullYear(), d.getMonth(), d.getDate(), 0, p[1]).getTime();
        var lo = Math.max(ini, agora), hi = Math.min(f, fim);
        if (hi > lo) { total += hi - lo; contou = true; }
        if (agora >= ini && agora < f && agora < fim) dentro = true;
      });
      if (contou) dias++;
    }
    d.setDate(d.getDate() + 1);
  }
  return { total: total, dentro: dentro, dias: dias };
}
// Avalia um dia lançado
function avaliar(dataStr, l, cfg) {
  l = l || {};
  var feitas = 0, pares = 0, meio = false, erro = false;
  [[l.e1, l.s1], [l.e2, l.s2]].forEach(function (p) {
    var a = paraMin(p[0]), b = paraMin(p[1]);
    if (a != null && b != null) { if (b > a) { feitas += b - a; pares++; } else erro = true; }
    else if (a != null || b != null) meio = true;
  });
  var d = lerData(dataStr), util = d ? cfg.dias[d.getDay()] : false;
  var esperado = util ? jornadaMin(cfg.jornada) : 0;
  var completo = !meio && !erro && (util ? pares === 2 : pares >= 1);
  return { feitas: feitas, esperado: esperado, completo: completo, saldo: feitas - esperado, vazio: pares === 0 && !meio && !erro, erro: erro };
}
function somaSaldos() {
  var s = 0;
  Object.keys(estado.lancamentos).forEach(function (d) {
    var a = avaliar(d, estado.lancamentos[d], estado.cfg);
    if (a.completo) s += a.saldo;
  });
  return s;
}
function bancoMin() { return estado.cfg.banco ? estado.ajuste + somaSaldos() : 0; }

/* ===== Tela: atualiza a cada segundo ===== */
function atualizarTempo() {
  var cfg = estado.cfg, agora = Date.now(), nd = new Date(agora);
  var fim = fimTs(cfg);
  var r = fim ? restante(agora, fim, cfg) : { total: 0, dentro: false, dias: 0 };
  var banco = bancoMin();
  var aposMs = r.total - banco * 60000;

  $('agora').textContent = dataCurta(nd) + ', ' + pad(nd.getHours()) + ':' + pad(nd.getMinutes());
  var falta = fim ? Math.max(0, fim - agora) : 0, t = Math.floor(falta / 1000);
  $('cDias').textContent = Math.floor(t / 86400);
  $('cHoras').textContent = pad(Math.floor(t % 86400 / 3600));
  $('cMin').textContent = pad(Math.floor(t % 3600 / 60));
  $('cSeg').textContent = pad(t % 60);
  $('acabou').hidden = !(fim && falta === 0);

  $('uteisDica').textContent = cfg.banco ? 'jornada restante − banco' : 'jornada restante';
  $('uteisGrande').textContent = hms(cfg.banco ? aposMs : r.total);
  $('statusPonto').classList.toggle('on', r.dentro);
  $('statusTexto').textContent = r.dentro ? 'Contando agora: você está no expediente.' : 'Contagem parada: fora do expediente.';

  $('restante').textContent = hm(Math.floor(r.total / 60000));
  $('aposBanco').textContent = hm(Math.floor(aposMs / 60000));
  $('aposBancoWrap').hidden = !cfg.banco;
  $('diasUteis').textContent = r.dias;
}

/* ===== Tela: partes que mudam quando você edita ===== */
function atualizarResumo() {
  var cfg = estado.cfg;
  $('titulo').textContent = cfg.titulo || 'Controle de horas';
  document.title = (cfg.titulo || 'Controle de horas') + ' · contagem';
  $('jornadaDiaria').textContent = hm(jornadaMin(cfg.jornada));
  $('bancoAtual').textContent = cfg.banco ? hm(bancoMin(), true) : 'Desligado';
  var fim = fimTs(cfg);
  if (fim) { var fd = new Date(fim); $('fimLabel').textContent = dataCurta(fd) + ', ' + pad(fd.getHours()) + ':' + pad(fd.getMinutes()); }
  else $('fimLabel').textContent = 'defina nas configurações';

  $('linkTempo').href = 'https://www.google.com/search?q=' + encodeURIComponent('previsão do tempo ' + (cfg.destino || ''));
  var vi = lerData(cfg.feriasIni), vf = lerData(cfg.feriasFim), txt = cfg.destino || 'Defina o destino nas configurações';
  if (vi && vf) {
    var per = (vi.getMonth() === vf.getMonth() && vi.getFullYear() === vf.getFullYear())
      ? vi.getDate() + ' a ' + vf.getDate() + ' de ' + MESES[vi.getMonth()]
      : pad(vi.getDate()) + '/' + pad(vi.getMonth() + 1) + ' a ' + pad(vf.getDate()) + '/' + pad(vf.getMonth() + 1);
    txt = (cfg.destino ? cfg.destino + ' · ' : '') + per;
  }
  $('feriasLabel').textContent = txt;
  atualizarDia();
  atualizarHistorico();
  atualizarTempo();
}

function atualizarDia() {
  var d = lerData(diaSel), hoje = diaSel === iso(new Date());
  var l = estado.lancamentos[diaSel] || {};
  $('selData').value = diaSel;
  CAMPOS.forEach(function (k) { var el = $('p-' + k); if (document.activeElement !== el) el.value = l[k] || ''; });
  $('diaTitulo').textContent = d ? (hoje ? 'Hoje · ' : 'Lançamento · ') + DS_LONGO[d.getDay()] + ', ' + pad(d.getDate()) + '/' + pad(d.getMonth() + 1) : 'Escolha um dia';
  var a = avaliar(diaSel, l, estado.cfg);
  $('diaStatus').textContent = a.erro ? 'Saída antes da entrada' : a.vazio ? 'Aguardando horários' : a.completo ? 'Dia fechado' : 'Em andamento';
  $('diaFeitas').textContent = hm(a.feitas);
  $('diaJornada').textContent = hm(a.esperado);
  $('diaSaldo').textContent = a.completo ? hm(a.saldo, true) : '—';
}

function atualizarHistorico() {
  var lista = $('hist'), datas = Object.keys(estado.lancamentos).sort().reverse().slice(0, 30);
  lista.innerHTML = '';
  $('histVazio').hidden = datas.length > 0;
  $('somaBanco').textContent = hm(somaSaldos(), true);
  datas.forEach(function (ds) {
    var a = avaliar(ds, estado.lancamentos[ds], estado.cfg), d = lerData(ds), rot = d ? dataCurta(d) : ds;
    var item = document.createElement('div');
    item.className = 'hist-item';

    var abrir = document.createElement('button');
    abrir.type = 'button'; abrir.className = 'abrir'; abrir.setAttribute('aria-label', 'Editar ' + rot);
    abrir.innerHTML = '<b></b><span></span>';
    abrir.querySelector('b').textContent = rot;
    abrir.querySelector('span').textContent = 'Feitas ' + hm(a.feitas) + ' · jornada ' + hm(a.esperado);
    abrir.onclick = function () { diaSel = ds; atualizarDia(); $('selData').scrollIntoView({ behavior: 'smooth', block: 'center' }); };

    var saldo = document.createElement('span');
    saldo.className = 'saldo num ' + (!a.completo ? 'aberto' : a.saldo >= 0 ? 'pos' : 'neg');
    saldo.textContent = a.completo ? hm(a.saldo, true) : 'em aberto';

    var rem = document.createElement('button');
    rem.type = 'button'; rem.className = 'remover'; rem.setAttribute('aria-label', 'Remover ' + rot);
    rem.innerHTML = '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M3 6h18"/><path d="M8 6V4h8v2"/><path d="M19 6l-1 14H6L5 6"/></svg>';
    rem.onclick = function () { delete estado.lancamentos[ds]; salvar(); atualizarResumo(); };

    item.append(abrir, saldo, rem);
    lista.appendChild(item);
  });
}

/* ===== Lançamentos do dia ===== */
function gravarCampo(k, v) {
  var l = Object.assign({ e1: '', s1: '', e2: '', s2: '' }, estado.lancamentos[diaSel] || {});
  l[k] = v || '';
  if (!l.e1 && !l.s1 && !l.e2 && !l.s2) delete estado.lancamentos[diaSel];
  else estado.lancamentos[diaSel] = l;
  salvar(); atualizarResumo();
}
CAMPOS.forEach(function (k) {
  $('p-' + k).addEventListener('change', function (e) { gravarCampo(k, e.target.value); });
});
$('selData').addEventListener('change', function (e) { if (e.target.value) { diaSel = e.target.value; atualizarDia(); } });
$('baterPonto').onclick = function () {
  var l = estado.lancamentos[diaSel] || {}, n = new Date(), agora = pad(n.getHours()) + ':' + pad(n.getMinutes());
  for (var i = 0; i < CAMPOS.length; i++) if (!l[CAMPOS[i]]) { gravarCampo(CAMPOS[i], agora); return; }
};
$('limparDia').onclick = function () { delete estado.lancamentos[diaSel]; salvar(); atualizarResumo(); };

/* ===== Configurações ===== */
var rascunhoDias, rascunhoBanco;
var ORDEM_DIAS = [1, 2, 3, 4, 5, 6, 0];

function desenharDias() {
  var box = $('cfgDias'); box.innerHTML = '';
  ORDEM_DIAS.forEach(function (i) {
    var b = document.createElement('button');
    b.type = 'button'; b.className = 'toggle'; b.textContent = DS_BTN[i];
    b.setAttribute('aria-pressed', rascunhoDias[i] ? 'true' : 'false');
    b.onclick = function () { rascunhoDias[i] = !rascunhoDias[i]; desenharDias(); };
    box.appendChild(b);
  });
}
function desenharBanco() {
  $('bancoSim').setAttribute('aria-pressed', rascunhoBanco ? 'true' : 'false');
  $('bancoNao').setAttribute('aria-pressed', rascunhoBanco ? 'false' : 'true');
  $('bancoArea').hidden = !rascunhoBanco;
  $('saldoCalc').textContent = hm(estado.ajuste + somaSaldos(), true);
}
function jornadaRascunho() { var j = {}; CAMPOS.forEach(function (k) { j[k] = $('j-' + k).value; }); return j; }
function atualizarTotal() { $('cfgTotal').textContent = hm(jornadaMin(jornadaRascunho())); }

$('abrirConfig').onclick = function () {
  var c = estado.cfg;
  $('cfgNome').value = c.titulo || '';
  $('cfgFimData').value = c.fimData || '';
  $('cfgFimHora').value = c.fimHora || '';
  CAMPOS.forEach(function (k) { $('j-' + k).value = c.jornada[k] || ''; });
  $('cfgDestino').value = c.destino || '';
  $('cfgFeriasIni').value = c.feriasIni || '';
  $('cfgFeriasFim').value = c.feriasFim || '';
  rascunhoDias = c.dias.slice(); rascunhoBanco = !!c.banco;
  $('ajusteArea').hidden = true; $('ajusteErro').hidden = true; $('salvarErro').hidden = true;
  desenharDias(); desenharBanco(); atualizarTotal();
  $('modal').hidden = false;
  $('fecharConfig').focus();
};
function fecharModal() { $('modal').hidden = true; $('abrirConfig').focus(); }
$('fecharConfig').onclick = fecharModal;
$('modal').addEventListener('click', function (e) { if (e.target === $('modal')) fecharModal(); });
$('modal').addEventListener('keydown', function (e) { if (e.key === 'Escape') fecharModal(); });
CAMPOS.forEach(function (k) { $('j-' + k).addEventListener('input', atualizarTotal); });
$('bancoSim').onclick = function () { rascunhoBanco = true; desenharBanco(); };
$('bancoNao').onclick = function () { rascunhoBanco = false; desenharBanco(); };

$('abrirAjuste').onclick = function () {
  var area = $('ajusteArea');
  area.hidden = !area.hidden;
  $('ajusteInput').value = hm(estado.ajuste + somaSaldos(), true);
  $('ajusteErro').hidden = true;
  if (!area.hidden) $('ajusteInput').focus();
};
$('aplicarAjuste').onclick = function () {
  var v = lerSaldo($('ajusteInput').value);
  if (v == null) { $('ajusteErro').textContent = 'Use o formato +09:37 ou -01:15.'; $('ajusteErro').hidden = false; return; }
  estado.ajuste = v - somaSaldos();   // o saldo informado passa a ser o saldo atual
  salvar(); desenharBanco(); atualizarResumo();
  $('ajusteArea').hidden = true;
};

$('salvarConfig').onclick = function () {
  var j = jornadaRascunho(), err = $('salvarErro');
  if (!lerData($('cfgFimData').value) || paraMin($('cfgFimHora').value) == null) { err.textContent = 'Informe a data e o horário do fim do expediente.'; err.hidden = false; return; }
  if (jornadaMin(j) === 0) { err.textContent = 'Preencha ao menos um período da jornada (entrada antes da saída).'; err.hidden = false; return; }
  estado.cfg = {
    titulo: $('cfgNome').value.trim(),
    fimData: $('cfgFimData').value, fimHora: $('cfgFimHora').value,
    jornada: j, dias: rascunhoDias.slice(), banco: rascunhoBanco,
    destino: $('cfgDestino').value.trim(),
    feriasIni: $('cfgFeriasIni').value, feriasFim: $('cfgFeriasFim').value
  };
  salvar(); atualizarResumo(); fecharModal();
};

/* ===== Início ===== */
atualizarResumo();
setInterval(atualizarTempo, 1000);
