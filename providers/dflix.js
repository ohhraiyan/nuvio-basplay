var BASE = 'https://movies.discoveryftp.net';
var TMDB_KEY = 'b5ce7bb7d827e838685ef4b98ff4941f';

function norm(s) {
  return (s || '').toLowerCase().replace(/&amp;/g, 'and').replace(/^the\s+/, '').replace(/[^a-z0-9]+/g, '');
}

function lastSeg(u) {
  return ((u || '').split('?')[0].split('/').pop() || '').toLowerCase();
}

function getMeta(kind, id) {
  return fetch('https://api.themoviedb.org/3/' + kind + '/' + id + '?api_key=' + TMDB_KEY)
    .then(function (r) { return r.json(); })
    .then(function (t) {
      return {
        title: t.title || t.name || '',
        alt: t.original_title || t.original_name || '',
        year: (t.release_date || t.first_air_date || '').slice(0, 4),
        poster: lastSeg(t.poster_path)
      };
    });
}

function search(sec, q) {
  return fetch(BASE + '/' + sec + '/find/' + encodeURIComponent(q))
    .then(function (r) { return r.text(); })
    .then(function (html) {
      var out = [];
      html.split('<div class="card"').slice(1).forEach(function (p) {
        var id = (p.match(/href=["']\/[ms]\/view\/(\d+)["']/) || [])[1];
        if (!id) return;
        var img = (p.match(/<img[^>]+src=["']([^"']+)["']/i) || [])[1] || '';
        var di = p.indexOf('class="details"');
        var d = di >= 0 ? p.slice(p.indexOf('>', di) + 1) : p;
        var tokens = d.replace(/<[^>]+>/g, '|').split('|')
          .map(function (s) { return s.replace(/&amp;/g, '&').replace(/&#039;|&#39;/g, "'").trim(); })
          .filter(Boolean);
        var year = (tokens.join(' ').match(/(\d{4})-\d{2}-\d{2}/) || [])[1] || '';
        out.push({ id: id, title: tokens[0] || '', year: year, poster: lastSeg(img) });
      });
      return out;
    });
}

function pick(res, t) {
  var names = [norm(t.title), norm(t.alt)].filter(Boolean);
  function titleOk(r) { return names.indexOf(norm(r.title)) !== -1; }
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

function findHit(sec, t) {
  var queries = [t.title];
  var short = t.title.split(':')[0];
  if (short !== t.title) queries.push(short);
  var plain = t.title.replace(/[^a-zA-Z0-9 ]+/g, ' ').replace(/\s+/g, ' ').trim();
  if (queries.indexOf(plain) === -1) queries.push(plain);
  if (t.alt && queries.indexOf(t.alt) === -1) queries.push(t.alt);
  function next(i) {
    if (i >= queries.length) return Promise.resolve(null);
    return search(sec, queries[i]).then(function (res) {
      return pick(res, t) || next(i + 1);
    }).catch(function () { return next(i + 1); });
  }
  return next(0);
}

function mk(u, label, page) {
  var q = (decodeURIComponent(u).match(/(2160|1080|720|480)p/i) || [])[0] || 'Unknown';
  return { name: 'DFLIX', title: label + ' ' + q, url: u, quality: q, headers: { Referer: page }, provider: 'dflix' };
}

function dbg(msg) {
  return [{ name: 'DBG', title: msg, url: 'http://0.0.0.0/dbg', quality: 'DBG', provider: 'dflix' }];
}

function movie(t) {
  return findHit('m', t).then(function (hit) {
    if (!hit) return [];
    var page = BASE + '/m/view/' + hit.id;
    return fetch(page).then(function (r) { return r.text(); }).then(function (html) {
      var top = html.split('Cast And Crew')[0];
      var links = files(top);
      var others = [], dup = {}, re = /href=["']\/m\/view\/(\d+)["']/g, m;
      while ((m = re.exec(top))) {
        if (m[1] !== hit.id && !dup[m[1]]) { dup[m[1]] = 1; others.push(m[1]); }
      }
      return Promise.all(others.slice(0, 3).map(function (id) {
        return fetch(BASE + '/m/view/' + id).then(function (r) { return r.text(); })
          .then(function (h2) { return files(h2.split('Cast And Crew')[0]); })
          .catch(function () { return []; });
      })).then(function (more) {
        more.forEach(function (a) { links = links.concat(a); });
        var done = {};
        return links.filter(function (u) { return !done[u] && (done[u] = 1); })
          .map(function (u) { return mk(u, t.title, page); });
      });
    });
  });
}

function tv(t, season, episode) {
  return findHit('s', t).then(function (hit) {
    if (!hit) return dbg('tv: no show match for "' + t.title + '" (' + t.year + ')');
    var page = BASE + '/s/view/' + hit.id;
    var ep = new RegExp('s0*' + season + '[ ._-]*e0*' + episode + '(?!\\d)|\\b' + season + 'x0*' + episode + '(?!\\d)', 'i');
    return fetch(page).then(function (r) { return r.text(); }).then(function (html) {
      var top = html.split('Cast And Crew')[0];
      var links = files(top);
      var subs = [], dup = {}, re = /href=["'](\/s\/(?!find)[^"']+)["']/g, m;
      while ((m = re.exec(top))) {
        var p = m[1];
        if (p.indexOf('/s/view/' + hit.id) === 0 || dup[p]) continue;
        if (/\/s\/(genre|category|type|lan|uhd|dual|playlist|report)/.test(p)) continue;
        dup[p] = 1; subs.push(p);
      }
      return Promise.all(subs.slice(0, 12).map(function (p) {
        return fetch(BASE + p).then(function (r) { return r.text(); })
          .then(function (h2) { return files(h2.split('Cast And Crew')[0]); })
          .catch(function () { return []; });
      })).then(function (more) {
        more.forEach(function (a) { links = links.concat(a); });
        var done = {};
        links = links.filter(function (u) { return !done[u] && (done[u] = 1); });
        var hits = links.filter(function (u) { return ep.test(decodeURIComponent(u)); });
        if (!hits.length) {
          return dbg('tv: show ' + hit.id + ' | files ' + links.length + ' | subpages ' + subs.length +
            ' | sample: ' + (links[0] ? decodeURIComponent(links[0]).split('/').pop() : 'none'));
        }
        var label = t.title + ' S' + season + 'E' + episode;
        return hits.map(function (u) { return mk(u, label, page); });
      });
    });
  });
}

function getStreams(tmdbId, mediaType, season, episode) {
  var kind = mediaType === 'tv' ? 'tv' : 'movie';
  return getMeta(kind, tmdbId).then(function (t) {
    if (!t.title) return [];
    return kind === 'tv' ? tv(t, season, episode) : movie(t);
  }).catch(function (e) {
    return kind === 'tv' ? dbg('ERR: ' + e) : [];
  });
}

module.exports = { getStreams: getStreams };
