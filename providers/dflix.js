var BASE = 'https://movies.discoveryftp.net';
var TMDB_KEY = 'b5ce7bb7d827e838685ef4b98ff4941f';

function norm(s) {
  return (s || '').toLowerCase().replace(/&amp;/g, 'and').replace(/[^a-z0-9]+/g, '');
}

function lastSeg(u) {
  return ((u || '').split('?')[0].split('/').pop() || '').toLowerCase();
}

function getMeta(id) {
  if (TMDB_KEY && TMDB_KEY !== 'YOUR_TMDB_V3_KEY') {
    return fetch('https://api.themoviedb.org/3/movie/' + id + '?api_key=' + TMDB_KEY)
      .then(function (r) { return r.json(); })
      .then(function (t) {
        return {
          title: t.title || '',
          alt: t.original_title || '',
          year: (t.release_date || '').slice(0, 4),
          poster: lastSeg(t.poster_path)
        };
      });
  }
  return fetch('https://www.themoviedb.org/movie/' + id + '?language=en-US', {
    headers: { 'User-Agent': 'Mozilla/5.0' }
  })
    .then(function (r) { return r.text(); })
    .then(function (html) {
      var og = (html.match(/<meta property="og:title" content="([^"]+)"/) || [])[1] || '';
      og = og.replace(/&amp;/g, '&').replace(/&#x27;|&#39;/g, "'").replace(/&quot;/g, '"');
      var img = (html.match(/<meta property="og:image" content="([^"]+)"/) || [])[1] || '';
      var m = og.match(/^(.*?)\s*\((\d{4})[^)]*\)\s*$/);
      return {
        title: m ? m[1] : og,
        alt: '',
        year: m ? m[2] : '',
        poster: lastSeg(img)
      };
    });
}

function search(q) {
  return fetch(BASE + '/m/find/' + encodeURIComponent(q))
    .then(function (r) { return r.text(); })
    .then(function (html) {
      var out = [];
      html.split('<div class="card"').slice(1).forEach(function (p) {
        var id = (p.match(/href=["']\/m\/view\/(\d+)["']/) || [])[1];
        if (!id) return;
        var img = (p.match(/<img[^>]+src=["']([^"']+)["']/i) || [])[1] || '';
        var d = p.slice(p.indexOf('class="details"'));
        var tokens = d.replace(/<[^>]+>/g, '|').split('|')
          .map(function (s) { return s.replace(/&amp;/g, '&').replace(/&#039;|&#39;/g, "'").trim(); })
          .filter(Boolean);
        var year = (tokens.join(' ').match(/(\d{4})-\d{2}-\d{2}/) || [])[1] || '';
        out.push({ id: id, tokens: tokens, year: year, poster: lastSeg(img) });
      });
      return out;
    });
}

function pick(res, t) {
  var names = [norm(t.title), norm(t.alt)].filter(Boolean);
  function titleOk(r) {
    return r.tokens.some(function (x) { return names.indexOf(norm(x)) !== -1; });
  }
  function yearNear(r) {
    return r.year && t.year && Math.abs(parseInt(r.year, 10) - parseInt(t.year, 10)) <= 1;
  }
  return (t.poster && res.filter(function (r) { return r.poster === t.poster; })[0])
      || res.filter(function (r) { return titleOk(r) && r.year === t.year; })[0]
      || res.filter(function (r) { return titleOk(r) && yearNear(r); })[0]
      || res.filter(titleOk)[0];
}

function fix(src) {
  src = src.replace(/&amp;/g, '&').replace(/ /g, '%20').replace(/\[/g, '%5B').replace(/\]/g, '%5D');
  if (src.indexOf('//') === 0) src = 'https:' + src;
  else if (src.charAt(0) === '/') src = BASE + src;
  return src;
}

function files(html) {
  var out = [], re = /href=["']([^"']+\.(?:mkv|mp4|m3u8))["']/gi, m;
  while ((m = re.exec(html))) out.push(fix(m[1]));
  return out;
}

// DEBUG version: returns fake rows describing each stage
function getStreams(tmdbId, mediaType) {
  var log = [];
  function out() {
    return log.map(function (l, i) {
      return { name: 'DBG', title: l, url: 'http://0.0.0.0/' + i, quality: 'DBG', provider: 'dflix' };
    });
  }
  return getMeta(tmdbId).then(function (t) {
    log.push('1 meta: ' + t.title + ' | ' + t.year + ' | ' + t.poster);
    return search(t.title).then(function (res) {
      log.push('2 results: ' + res.length + ' | first: ' + (res[0] ? res[0].tokens.join('/') + ' ' + res[0].poster : 'none'));
      var hit = pick(res, t);
      log.push('3 hit: ' + (hit ? hit.id : 'none'));
      if (!hit) return out();
      return fetch(BASE + '/m/view/' + hit.id).then(function (r) { return r.text(); }).then(function (html) {
        log.push('4 page len: ' + html.length + ' | files: ' + files(html.split('Cast And Crew')[0]).length);
        return out();
      });
    });
  }).catch(function (e) {
    log.push('ERR: ' + e);
    return out();
  });
}

module.exports = { getStreams: getStreams };
