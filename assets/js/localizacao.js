/* Küster & Francisco — § VI Localização
   A rolagem controla uma única câmera: o mapa desce do estado até a Rua Balduíno Sens,
   corta para a fachada no primeiro quadro do vídeo de drone e o vídeo recua até mostrar a cidade. */
(() => {
  const sec = document.querySelector('[data-loc]')
  if (!sec) return

  const REDUZIDO = matchMedia('(prefers-reduced-motion: reduce)').matches
  const MAPLIBRE_JS = 'https://cdn.jsdelivr.net/npm/maplibre-gl@4.7.1/dist/maplibre-gl.js'
  const MAPLIBRE_CSS = 'https://cdn.jsdelivr.net/npm/maplibre-gl@4.7.1/dist/maplibre-gl.css'
  const ESTILO = 'https://tiles.openfreemap.org/styles/positron'
  const SATELITE = 'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}'
  const KF = [-49.6002326, -27.4174135]

  /* Fases da rolagem (0 → 1 ao longo da seção) */
  const FASE = { mapaFim: 0.5, corteIni: 0.47, corteFim: 0.57, videoIni: 0.55, videoFim: 0.93, cartao: 0.9 }

  /* Câmera: [progresso dentro do mapa, centro, zoom, inclinação, rotação] */
  const CAMERA = [
    { t: 0.0, c: [-50.6, -27.25], z: 6.4, p: 0, b: 0 },
    { t: 0.38, c: [-49.612, -27.414], z: 12.4, p: 28, b: -6 },
    { t: 0.78, c: [-49.6003, -27.4176], z: 16.9, p: 52, b: -12 },
    { t: 1.0, c: KF, z: 18.4, p: 60, b: -12 },
  ]

  const stage = sec.querySelector('.loc__stage')
  const mapaEl = sec.querySelector('[data-map]')
  const video = sec.querySelector('[data-video]')
  const legendas = [...sec.querySelectorAll('[data-leg]')]
  const cartao = sec.querySelector('[data-card]')
  const barra = sec.querySelector('[data-barra]')
  const hudLat = sec.querySelector('[data-hud-lat]')
  const hudLng = sec.querySelector('[data-hud-lng]')
  const hudAlt = sec.querySelector('[data-hud-alt]')

  /* Sem movimento: mostra a foto aérea e o cartão, sem prender a rolagem */
  if (REDUZIDO) { sec.classList.add('is-static'); return }

  const clamp = (v, a = 0, b = 1) => Math.min(b, Math.max(a, v))
  const faixa = (v, a, b) => clamp((v - a) / (b - a))
  const suave = (t) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2)
  const lerp = (a, b, t) => a + (b - a) * t

  function camera(t) {
    let i = 0
    while (i < CAMERA.length - 2 && t > CAMERA[i + 1].t) i++
    const a = CAMERA[i], b = CAMERA[i + 1]
    const k = suave(faixa(t, a.t, b.t))
    return {
      center: [lerp(a.c[0], b.c[0], k), lerp(a.c[1], b.c[1], k)],
      zoom: lerp(a.z, b.z, k),
      pitch: lerp(a.p, b.p, k),
      bearing: lerp(a.b, b.b, k),
    }
  }

  function dms(v, pos, neg) {
    const s = v < 0 ? neg : pos
    v = Math.abs(v)
    const g = Math.floor(v), m = Math.floor((v - g) * 60), sg = Math.round(((v - g) * 60 - m) * 60)
    return `${g}°${String(m).padStart(2, '0')}′${String(sg).padStart(2, '0')}″ ${s}`
  }

  /* --- Mapa ------------------------------------------------------------------ */
  let mapa = null
  let mapaPronto = false
  let satId = null
  let simbolos = []
  let marcador = null

  function carregarScript(src) {
    return new Promise((ok, erro) => {
      const s = document.createElement('script')
      s.src = src; s.onload = ok; s.onerror = () => erro(new Error(`Falha ao carregar ${src}`))
      document.head.appendChild(s)
    })
  }

  /* Reaplica as cores da marca sobre o estilo Positron */
  function tingir(estilo) {
    const C = { fundo: '#1A1E1F', agua: '#243033', verde: '#1E2526', bairro: '#1F2425', predio: '#2B3132',
      via: '#353C3D', viaMaior: '#4A5253', rodovia: '#8C7238', limite: '#C6A96A', texto: '#A3AAAA', cidade: '#ECEAE4' }
    for (const l of estilo.layers) {
      const p = (l.paint ||= {})
      const id = l.id
      if (l.type === 'background') p['background-color'] = C.fundo
      else if (l.type === 'fill') {
        p['fill-color'] = id.includes('water') ? C.agua : id.includes('park') || id.includes('wood') ? C.verde
          : id.includes('building') ? C.predio : C.bairro
        delete p['fill-outline-color']
      } else if (l.type === 'line') {
        if (id.includes('casing')) p['line-color'] = C.fundo
        else if (id.includes('motorway')) p['line-color'] = C.rodovia
        else if (id.includes('major')) p['line-color'] = C.viaMaior
        else if (id.startsWith('boundary')) { p['line-color'] = C.limite; p['line-opacity'] = 0.5 }
        else if (id.includes('water')) p['line-color'] = C.agua
        else p['line-color'] = C.via
      } else if (l.type === 'symbol') {
        p['text-color'] = id.startsWith('label_city') || id.startsWith('label_state') || id.startsWith('label_town') ? C.cidade : C.texto
        p['text-halo-color'] = C.fundo
        p['text-halo-width'] = 1.2
        if (id.includes('shield')) l.layout = { ...l.layout, visibility: 'none' }
      }
    }
    // satélite entra abaixo dos rótulos e acima das vias
    const primeiroSimbolo = estilo.layers.findIndex((l) => l.type === 'symbol')
    estilo.sources.satelite = { type: 'raster', tiles: [SATELITE], tileSize: 256, maxzoom: 18,
      attribution: 'Imagens © Esri, Maxar, Earthstar Geographics' }
    estilo.layers.splice(primeiroSimbolo, 0, { id: 'satelite', type: 'raster', source: 'satelite',
      paint: { 'raster-opacity': 0, 'raster-fade-duration': 0, 'raster-saturation': -0.25, 'raster-contrast': 0.05 } })
    return estilo
  }

  async function iniciarMapa() {
    try {
      const css = document.createElement('link')
      css.rel = 'stylesheet'; css.href = MAPLIBRE_CSS
      document.head.appendChild(css)
      const [, estilo] = await Promise.all([carregarScript(MAPLIBRE_JS), fetch(ESTILO).then((r) => r.json())])
      const cam = camera(0)
      mapa = new window.maplibregl.Map({
        container: mapaEl, style: tingir(estilo), interactive: false,
        attributionControl: { compact: true }, fadeDuration: 0, maxPitch: 70,
        ...cam,
      })
      satId = 'satelite'
      mapa.on('load', () => {
        simbolos = mapa.getStyle().layers.filter((l) => l.type === 'symbol').map((l) => l.id)
        const el = document.createElement('div')
        el.className = 'pin'
        el.innerHTML = '<img src="assets/img/brasao.png" alt="">'
        marcador = new window.maplibregl.Marker({ element: el, anchor: 'bottom' }).setLngLat(KF).addTo(mapa)
        mapaPronto = true
        render(true)
      })
    } catch (erro) {
      // sem rede ou bloqueio: a seção vira estática, com a foto e o cartão
      console.error('Localização: mapa indisponível', erro)
      sec.classList.add('is-static')
    }
  }

  /* --- Vídeo ------------------------------------------------------------------ */
  let videoPronto = false
  function iniciarVideo() {
    const fonte = video.querySelector('source')
    const pequeno = matchMedia('(max-width: 900px)').matches || navigator.connection?.saveData
    fonte.src = pequeno ? fonte.dataset.srcSmall : fonte.dataset.srcLarge
    video.preload = 'auto'
    video.load()
    video.addEventListener('loadeddata', () => { videoPronto = true; render(true) }, { once: true })
    // iOS só exibe quadros após um play iniciado pelo próprio vídeo mudo
    video.play().then(() => video.pause()).catch(() => {})
  }

  /* --- Progresso e desenho ------------------------------------------------------- */
  function progresso() {
    const r = sec.getBoundingClientRect()
    return clamp(-r.top / (r.height - innerHeight))
  }

  let ultimo = -1
  let alvoTempo = 0
  function render(forcar = false) {
    const p = progresso()
    if (!forcar && Math.abs(p - ultimo) < 0.0005) return
    ultimo = p
    barra.style.transform = `scaleX(${p})`

    // mapa
    const tm = faixa(p, 0, FASE.mapaFim)
    const cam = camera(tm)
    if (mapaPronto) {
      mapa.jumpTo(cam)
      const sat = faixa(cam.zoom, 13.2, 16.6)
      mapa.setPaintProperty(satId, 'raster-opacity', sat)
      const txt = 1 - faixa(cam.zoom, 15.5, 17.5)
      simbolos.forEach((id) => mapa.setPaintProperty(id, 'text-opacity', txt))
      if (marcador) marcador.getElement().style.opacity = String(faixa(cam.zoom, 9, 11) * (1 - faixa(p, FASE.corteIni, FASE.corteFim)))
    }

    // corte mapa → fachada
    const corte = suave(faixa(p, FASE.corteIni, FASE.corteFim))
    mapaEl.style.opacity = String(1 - corte)
    mapaEl.style.filter = corte > 0 ? `blur(${(corte * 6).toFixed(1)}px)` : ''
    video.style.opacity = String(corte)
    video.style.transform = `scale(${(1.14 - 0.14 * corte).toFixed(4)})`

    // vídeo recuando
    if (videoPronto && video.duration) alvoTempo = faixa(p, FASE.videoIni, FASE.videoFim) * (video.duration - 0.05)

    // legendas
    const leg = p < 0.14 ? 0 : p < 0.32 ? 1 : p < FASE.corteFim ? 2 : -1
    legendas.forEach((li, i) => li.classList.toggle('is-on', i === leg))

    // cartão final
    cartao.classList.toggle('is-on', p > FASE.cartao)

    // painel de coordenadas
    const lat = p < FASE.corteIni ? cam.center[1] : KF[1]
    const lng = p < FASE.corteIni ? cam.center[0] : KF[0]
    hudLat.textContent = dms(lat, 'N', 'S')
    hudLng.textContent = dms(lng, 'L', 'O')
    if (p < FASE.corteIni) {
      const mpp = (40075016 * Math.cos((lat * Math.PI) / 180)) / Math.pow(2, cam.zoom + 8)
      const alt = mpp * innerHeight * 0.9 * Math.cos((cam.pitch * Math.PI) / 180)
      hudAlt.textContent = `alt. ≈ ${alt > 9999 ? `${Math.round(alt / 1000).toLocaleString('pt-BR')} km` : `${Math.round(alt).toLocaleString('pt-BR')} m`}`
    } else {
      hudAlt.textContent = 'imagem aérea · recuo'
    }
  }

  /* Busca de quadro desacoplada da rolagem: evita fila de seeks no vídeo */
  function laço() {
    render()
    if (videoPronto && !video.seeking && Math.abs(video.currentTime - alvoTempo) > 1 / 30) video.currentTime = alvoTempo
    if (ativo) requestAnimationFrame(laço)
  }

  /* --- Ativação preguiçosa ---------------------------------------------------------- */
  let iniciado = false
  let ativo = false
  new IntersectionObserver((ents) => {
    ents.forEach((en) => {
      if (en.isIntersecting && !iniciado) { iniciado = true; iniciarMapa(); iniciarVideo() }
      if (en.isIntersecting && !ativo) { ativo = true; requestAnimationFrame(laço) }
      if (!en.isIntersecting) ativo = false
    })
  }, { rootMargin: '120% 0px 120% 0px' }).observe(sec)

  addEventListener('resize', () => { mapa?.resize(); render(true) })
  stage.dataset.pronto = '1'
})()
