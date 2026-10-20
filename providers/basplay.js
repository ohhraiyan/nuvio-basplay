var BASE = 'http://10.20.30.40';
var TMDB_KEY = 'b5ce7bb7d827e838685ef4b98ff4941f';

function norm(s) {
  return (s || '').toLowerCase().replace(/&amp;/g, 'and').replace(/[^a-z0-9]+/g, '');
}

function search(q) {
  return fetch(BASE + '/search.php?q=' + encodeURIComponent(q))
    .then(function (r) { return r.text(); })
    .then(function (html) {
      var out = [];
      var re = /<a[^>]+href=["']view\.php\?id=(\d+)["'][^>]*>([\s\S]*?)<\/a>/gi, m;
      while ((m = re.exec(html))) {
        var alt = (m[2].match(/alt=["']([^"']*)["']/i) || [])[1] || '';
        var year = (m[2].match(/\b(19|20)\d{2}\b/) || [])[0] || '';
        out.push({ id: m[1], title: alt, year: year });
      }
      return out;
    });
}

function getStreams(tmdbId, mediaType, season, episode) {
  var kind = mediaType === 'tv' ? 'tv' : 'movie';
  return fetch('https://api.themoviedb.org/3/' + kind + '/' + tmdbId + '?api_key=' + TMDB_KEY)
    .then(function (r) { return r.json(); })
    .then(function (t) {
      var title = t.title || t.name || '';
      var year = (t.release_date || t.first_air_date || '').slice(0, 4);
      var short = title.split(':')[0];

      return search(title).then(function (res) {
        if (!res.length && short !== title) return search(short);
        return res;
      }).then(function (res) {
        var nt = norm(title);
        var hit = res.filter(function (r) { return norm(r.title) === nt && r.year === year; })[0]
               || res.filter(function (r) { return norm(r.title) === nt; })[0]
               || res.filter(function (r) { return r.year === year && norm(r.title).indexOf(norm(short)) === 0; })[0];
        if (!hit) return [];

        // TODO tv: episode addressing unknown
        var url = BASE + '/player.php?id=' + hit.id;
        return fetch(url).then(function (r) { return r.text(); }).then(function (html) {
          var m = html.match(/<source[^>]+src=["']([^"']+)["']/i)
               || html.match(/["']([^"']*\/Data\/[^"']+\.(?:mkv|mp4|m3u8)[^"']*)["']/i)
               || html.match(/["'](https?:[^"']+\.(?:mkv|mp4|m3u8)[^"']*)["']/i);
          if (!m) return [];
          var src = m[1].replace(/&amp;/g, '&');
          if (src.charAt(0) === '/') src = BASE + src;
          src = src.replace(/ /g, '%20');
          var q = (src.match(/(2160|1080|720|480)p/i) || [])[0] || 'Unknown';
          return [{
            name: 'BAS PLAY',
            title: title + ' ' + q,
            url: src,
            quality: q,
            headers: { Referer: url },
            provider: 'basplay'
          }];
        });
      });
    })
    .catch(function () { return []; });
}

module.exports = { getStreams: getStreams };
