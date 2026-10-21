var BASE = 'https://movies.discoveryftp.net';

function norm(s) {
  return (s || '').toLowerCase().replace(/&amp;/g, 'and').replace(/[^a-z0-9]+/g, '');
}

function getMeta(kind, id) {
  return fetch('https://www.themoviedb.org/' + kind + '/' + id + '?language=en-US', {
    headers: { 'User-Agent': 'Mozilla/5.0' }
  })
    .then(function (r) { return r.text(); })
    .then(function (html) {
      var og = (html.match(/<meta property="og:title" content="([^"]+)"/) || [])[1] || '';
      og = og.replace(/&amp;/g, '&').replace(/&#x27;|&#39;/g, "'").replace(/&quot;/g, '"');
      var m = og.match(/^(.*?)\s*\((?:TV Series\s*)?(\d{4})[^)]*\)\s*$/);
      return m ? { title: m[1], year: m[2] } : { title: og, year: '' };
    });
}

function search(q) {
  return fetch(BASE + '/m/find/' + encodeURIComponent(q))
    .then(function (r) { return r.text(); })
    .then(function (html) {
      var out = [];
      var parts = html.split('<div class="card"').slice(1);
      parts.forEach(function (p) {
        var id = (p.match(/href=["']\/m\/view\/(\d+)["']/) || [])[1];
        if (!id) return;
        var d = p.slice(p.indexOf('class="details"'));
        var text = d.replace(/<[^>]+>/g, '|').split('|')
          .map(function (s) { return s.replace(/&amp;/g, '&').trim(); })
          .filter(Boolean);
        var date = (text.join(' ').match(/(\d{4})-\d{2}-\d{2}/) || [])[1] || '';
        out.push({ id: id, title: text[0] || '', year: date });
      });
      return out;
    });
}

function getStreams(tmdbId, mediaType) {
  if (mediaType === 'tv') return Promise.resolve([]);
  return getMeta('movie', tmdbId)
    .then(function (t) {
      var title = t.title, year = t.year;
      var short = title.split(':')[0];
      return search(title).then(function (res) {
        if (!res.length && short !== title) return search(short);
        return res;
      }).then(function (res) {
        var nt = norm(title);
        var hit = res.filter(function (r) { return norm(r.title) === nt && r.year === year; })[0]
               || res.filter(function (r) { return norm(r.title) === nt; })[0];
        if (!hit) return [];
        var page = BASE + '/m/view/' + hit.id;
        return fetch(page).then(function (r) { return r.text(); }).then(function (html) {
          var seen = {}, out = [];
          var re = /(?:href|src)=["']([^"']+\.(?:mkv|mp4|m3u8)(?:\?[^"']*)?)["']/gi, m;
          while ((m = re.exec(html))) {
            var src = m[1].replace(/&amp;/g, '&').replace(/ /g, '%20');
            if (src.indexOf('//') === 0) src = 'https:' + src;
            else if (src.charAt(0) === '/') src = BASE + src;
            if (seen[src]) continue;
            seen[src] = 1;
            var q = (decodeURIComponent(src).match(/(2160|1080|720|480)p/i) || [])[0] || 'Unknown';
            out.push({
              name: 'DFLIX',
              title: title + ' ' + q,
              url: src,
              quality: q,
              headers: { Referer: page },
              provider: 'dflix'
            });
          }
          return out;
        });
      });
    })
    .catch(function () { return []; });
}

module.exports = { getStreams: getStreams };
