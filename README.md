# Küster & Francisco · site institucional

Site estático (HTML, CSS e JavaScript, sem build) do escritório Küster & Francisco Advocacia e Consultoria Jurídica, Ituporanga/SC.

- `index.html` — página principal
- `assets/css/site.css` — estilos (tokens de cor e tipografia no topo)
- `assets/js/site.js` — rolagem suave, revelações, cabeçalho e índice de capítulos
- `assets/js/localizacao.js` — sequência da seção Localização (mapa → vídeo de drone)
- `assets/video/` — vídeo de drone tratado (sem áudio) em duas resoluções

Para ver localmente: `npx serve .` dentro desta pasta (o vídeo precisa de um servidor com suporte a Range; abrir o arquivo direto não basta).

Mapa: MapLibre GL + OpenFreeMap (© OpenStreetMap). Satélite: Esri World Imagery.
