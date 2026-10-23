/* Küster & Francisco — comportamento geral: rolagem, revelações, cabeçalho e índice */
(() => {
  const REDUZIDO = matchMedia('(prefers-reduced-motion: reduce)').matches
  const $ = (s, r = document) => r.querySelector(s)
  const $$ = (s, r = document) => [...r.querySelectorAll(s)]

  /* --- Rolagem suave --------------------------------------------------- */
  let lenis = null
  if (!REDUZIDO && window.Lenis) {
    lenis = new window.Lenis({
      duration: 1.15,
      easing: (t) => Math.min(1, 1.001 - Math.pow(2, -10 * t)),
      smoothWheel: true,
    })
    const raf = (t) => { lenis.raf(t); requestAnimationFrame(raf) }
    requestAnimationFrame(raf)
  }
  window.kfLenis = lenis

  /* --- Âncoras ------------------------------------------------------------ */
  const hd = $('[data-hd]')
  const fecharMenu = () => {
    hd.classList.remove('is-open')
    $('[data-menu]').setAttribute('aria-expanded', 'false')
    lenis?.start()
  }
  $$('a[href^="#"]').forEach((a) => {
    a.addEventListener('click', (e) => {
      const alvo = $(a.getAttribute('href'))
      if (!alvo) return
      e.preventDefault()
      fecharMenu()
      if (lenis) lenis.scrollTo(alvo, { offset: 0, duration: 1.6 })
      else alvo.scrollIntoView({ behavior: REDUZIDO ? 'auto' : 'smooth' })
      history.replaceState(null, '', a.getAttribute('href'))
    })
  })

  /* --- Menu móvel --------------------------------------------------------- */
  $('[data-menu]').addEventListener('click', (e) => {
    const aberto = hd.classList.toggle('is-open')
    e.currentTarget.setAttribute('aria-expanded', String(aberto))
    aberto ? lenis?.stop() : lenis?.start()
  })
  addEventListener('keydown', (e) => { if (e.key === 'Escape' && hd.classList.contains('is-open')) fecharMenu() })

  /* --- Quebra de títulos em linhas (máscara) ------------------------------ */
  function dividirLinhas(el) {
    const html = el.dataset.orig ?? el.innerHTML
    el.dataset.orig = html
    el.setAttribute('aria-label', el.textContent.replace(/\s+/g, ' ').trim())
    // embrulha cada palavra preservando <em>
    const tmp = document.createElement('div')
    tmp.innerHTML = html
    const palavras = []
    const andar = (no, emItalico) => {
      no.childNodes.forEach((n) => {
        if (n.nodeType === 3) n.textContent.split(/(\s+)/).forEach((p) => { if (p.trim()) palavras.push({ p, i: emItalico }) })
        else andar(n, emItalico || n.nodeName === 'EM')
      })
    }
    andar(tmp, false)
    el.innerHTML = palavras.map((w) => `<span class="_w">${w.i ? `<em>${w.p}</em>` : w.p}</span>`).join(' ')
    const linhas = []
    let topo = null
    $$('._w', el).forEach((w) => {
      const t = Math.round(w.offsetTop)
      if (t !== topo) { linhas.push([]); topo = t }
      linhas.at(-1).push(w.innerHTML)
    })
    el.innerHTML = linhas
      .map((l, i) => `<span class="ln" aria-hidden="true"><span style="transition-delay:${(i * 0.09).toFixed(2)}s">${l.join(' ')}</span></span>`)
      .join('')
  }

  /* --- Revelações ------------------------------------------------------------ */
  const alvos = $$('.rv-media, .rv, [data-split]')
  $$('[data-stagger]').forEach((g) => {
    const passo = parseFloat(g.dataset.stagger) || 0.06
    ;[...g.children].forEach((c, i) => {
      c.style.setProperty('--d', `${(i % 6) * passo}s`)
      $$('.rv-media', c).forEach((m) => { m.style.transitionDelay = `${(i % 3) * 0.12}s` })
    })
  })
  if (REDUZIDO || !('IntersectionObserver' in window)) {
    alvos.forEach((el) => el.classList.add('is-in'))
  } else {
    const prepararSplits = () => $$('[data-split]').forEach(dividirLinhas)
    document.fonts?.ready ? document.fonts.ready.then(prepararSplits) : prepararSplits()
    const io = new IntersectionObserver((ents) => {
      ents.forEach((en) => {
        if (!en.isIntersecting) return
        en.target.classList.add('is-in')
        io.unobserve(en.target)
      })
    }, { rootMargin: '0px 0px -10% 0px', threshold: 0.12 })
    alvos.forEach((el) => io.observe(el))
    let largura = innerWidth
    addEventListener('resize', () => {
      if (Math.abs(innerWidth - largura) < 40) return
      largura = innerWidth
      $$('[data-split]').forEach(dividirLinhas)
    })
  }

  /* --- Cabeçalho e índice de capítulo ---------------------------------------- */
  const rail = $('.rail')
  const railTxt = $('[data-rail]')
  const capitulos = $$('[data-chapter]')
  const escuros = $$('[data-tone="dark"]')
  const links = $$('.hd__nav ul a')
  let ultimoY = scrollY
  let pedido = false

  function atualizar() {
    pedido = false
    const y = scrollY
    const h = hd.offsetHeight
    // tom do cabeçalho conforme a banda abaixo dele
    const sobreEscuro = escuros.some((s) => { const r = s.getBoundingClientRect(); return r.top <= h * 0.5 && r.bottom > h * 0.5 })
    hd.classList.toggle('is-dark', sobreEscuro)
    hd.classList.toggle('is-solid', y > 24)
    // esconde ao descer, mostra ao subir
    if (!hd.classList.contains('is-open')) hd.classList.toggle('is-hidden', y > 480 && y > ultimoY + 2)
    if (y < ultimoY - 2) hd.classList.remove('is-hidden')
    ultimoY = y

    // capítulo atual pela linha do meio da tela
    const meio = innerHeight * 0.5
    const atual = capitulos.find((s) => { const r = s.getBoundingClientRect(); return r.top <= meio && r.bottom > meio })
    if (atual) {
      if (railTxt.textContent !== atual.dataset.chapter) railTxt.textContent = atual.dataset.chapter
      const r = atual.getBoundingClientRect()
      rail.classList.toggle('is-dark', atual.dataset.tone === 'dark')
      rail.classList.toggle('is-hidden', atual.id === 'topo' || (atual.id === 'localizacao' && r.top < 0))
      links.forEach((a) => a.setAttribute('aria-current', String(a.getAttribute('href') === `#${atual.id}`)))
    }
  }
  const agendar = () => { if (!pedido) { pedido = true; requestAnimationFrame(atualizar) } }
  addEventListener('scroll', agendar, { passive: true })
  addEventListener('resize', agendar)
  atualizar()

  /* --- Ano fixo da trajetória ------------------------------------------------- */
  const ano = $('[data-ano]')
  if (ano && 'IntersectionObserver' in window) {
    const io = new IntersectionObserver((ents) => {
      ents.forEach((en) => {
        if (!en.isIntersecting) return
        const novo = en.target.dataset.anoItem
        if (ano.textContent === novo) return
        ano.classList.add('is-swap')
        setTimeout(() => { ano.textContent = novo; ano.classList.remove('is-swap') }, REDUZIDO ? 0 : 220)
      })
    }, { rootMargin: '-45% 0px -45% 0px' })
    $$('[data-ano-item]').forEach((li) => io.observe(li))
  }
})()
