/* CLAUDIO v3 - core/matrix.js
 * Algebra lineare minima ma solida: prodotti, QR (Householder), Cholesky,
 * inversa, pseudo-inversa, autovalori simmetrici (Jacobi), soluzione ai minimi quadrati.
 * Matrici = array di array (righe).
 */
;(function (root, name, factory) {
  var api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  (root.C3 = root.C3 || {})[name] = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, 'matrix', function () {
  'use strict';

  function zeros(n, m) {
    var a = new Array(n);
    for (var i = 0; i < n; i++) a[i] = new Array(m).fill(0);
    return a;
  }

  function identity(n) {
    var a = zeros(n, n);
    for (var i = 0; i < n; i++) a[i][i] = 1;
    return a;
  }

  function clone(A) { return A.map(function (r) { return r.slice(); }); }

  function transpose(A) {
    var n = A.length, m = A[0].length, B = zeros(m, n);
    for (var i = 0; i < n; i++) for (var j = 0; j < m; j++) B[j][i] = A[i][j];
    return B;
  }

  function mul(A, B) {
    var n = A.length, k = B.length, m = B[0].length, C = zeros(n, m), i, j, p, s;
    for (i = 0; i < n; i++) {
      for (j = 0; j < m; j++) {
        s = 0;
        for (p = 0; p < k; p++) s += A[i][p] * B[p][j];
        C[i][j] = s;
      }
    }
    return C;
  }

  function mulVec(A, v) {
    var n = A.length, m = v.length, out = new Array(n), i, j, s;
    for (i = 0; i < n; i++) {
      s = 0;
      for (j = 0; j < m; j++) s += A[i][j] * v[j];
      out[i] = s;
    }
    return out;
  }

  function addScaled(A, B, k) {
    return A.map(function (r, i) {
      return r.map(function (v, j) { return v + k * B[i][j]; });
    });
  }

  /** A^T A */
  function crossprod(A) {
    var n = A.length, m = A[0].length, C = zeros(m, m), i, j, k, s;
    for (i = 0; i < m; i++) {
      for (j = i; j < m; j++) {
        s = 0;
        for (k = 0; k < n; k++) s += A[k][i] * A[k][j];
        C[i][j] = s; C[j][i] = s;
      }
    }
    return C;
  }

  /** A^T b */
  function crossvec(A, b) {
    var n = A.length, m = A[0].length, out = new Array(m).fill(0), i, j;
    for (j = 0; j < m; j++) {
      var s = 0;
      for (i = 0; i < n; i++) s += A[i][j] * b[i];
      out[j] = s;
    }
    return out;
  }

  /** Cholesky di matrice simmetrica definita positiva; null se non SPD. */
  function cholesky(A) {
    var n = A.length, L = zeros(n, n), i, j, k, s;
    for (i = 0; i < n; i++) {
      for (j = 0; j <= i; j++) {
        s = A[i][j];
        for (k = 0; k < j; k++) s -= L[i][k] * L[j][k];
        if (i === j) {
          if (s <= 0) return null;
          L[i][i] = Math.sqrt(s);
        } else {
          L[i][j] = s / L[j][j];
        }
      }
    }
    return L;
  }

  /** Risolve A x = b con A SPD via Cholesky. */
  function solveSPD(A, b) {
    var L = cholesky(A);
    if (!L) return null;
    var n = A.length, y = new Array(n), x = new Array(n), i, k, s;
    for (i = 0; i < n; i++) {
      s = b[i];
      for (k = 0; k < i; k++) s -= L[i][k] * y[k];
      y[i] = s / L[i][i];
    }
    for (i = n - 1; i >= 0; i--) {
      s = y[i];
      for (k = i + 1; k < n; k++) s -= L[k][i] * x[k];
      x[i] = s / L[i][i];
    }
    return x;
  }

  /** Inversa via Gauss-Jordan con pivoting parziale; null se singolare. */
  function inverse(Ain) {
    var n = Ain.length, A = clone(Ain), I = identity(n), i, j, k, p, maxv, tmp, f;
    for (i = 0; i < n; i++) {
      p = i; maxv = Math.abs(A[i][i]);
      for (k = i + 1; k < n; k++) {
        if (Math.abs(A[k][i]) > maxv) { maxv = Math.abs(A[k][i]); p = k; }
      }
      if (maxv < 1e-14) return null;
      if (p !== i) {
        tmp = A[i]; A[i] = A[p]; A[p] = tmp;
        tmp = I[i]; I[i] = I[p]; I[p] = tmp;
      }
      var d = A[i][i];
      for (j = 0; j < n; j++) { A[i][j] /= d; I[i][j] /= d; }
      for (k = 0; k < n; k++) {
        if (k === i) continue;
        f = A[k][i];
        if (f === 0) continue;
        for (j = 0; j < n; j++) { A[k][j] -= f * A[i][j]; I[k][j] -= f * I[i][j]; }
      }
    }
    return I;
  }

  function det(Ain) {
    var n = Ain.length, A = clone(Ain), d = 1, i, j, k, p, maxv, tmp;
    for (i = 0; i < n; i++) {
      p = i; maxv = Math.abs(A[i][i]);
      for (k = i + 1; k < n; k++) if (Math.abs(A[k][i]) > maxv) { maxv = Math.abs(A[k][i]); p = k; }
      if (maxv < 1e-300) return 0;
      if (p !== i) { tmp = A[i]; A[i] = A[p]; A[p] = tmp; d = -d; }
      d *= A[i][i];
      for (k = i + 1; k < n; k++) {
        var f = A[k][i] / A[i][i];
        for (j = i; j < n; j++) A[k][j] -= f * A[i][j];
      }
    }
    return d;
  }

  /** Rango numerico via eliminazione con pivoting. */
  function rank(Ain, tol) {
    var A = clone(Ain), n = A.length, m = A[0].length, r = 0, i, j, k;
    tol = tol || 1e-10;
    for (j = 0; j < m && r < n; j++) {
      var p = r, maxv = Math.abs(A[r][j]);
      for (i = r + 1; i < n; i++) if (Math.abs(A[i][j]) > maxv) { maxv = Math.abs(A[i][j]); p = i; }
      if (maxv < tol) continue;
      var t = A[r]; A[r] = A[p]; A[p] = t;
      for (i = r + 1; i < n; i++) {
        var f = A[i][j] / A[r][j];
        for (k = j; k < m; k++) A[i][k] -= f * A[r][k];
      }
      r++;
    }
    return r;
  }

  /**
   * Minimi quadrati via QR con riflessioni di Householder.
   * Ritorna { beta, R, qty, rss, rank } con R triangolare superiore (p x p).
   */
  function qrSolve(Xin, y) {
    var X = clone(Xin), n = X.length, p = X[0].length;
    var b = y.slice();
    var i, j, k, s, alpha, v, vnorm, dot;
    var Rdiag = new Array(p).fill(0);
    var vs = [];
    var kmax = Math.min(n, p); // con piu parametri che osservazioni si ferma alle righe disponibili
    for (k = 0; k < kmax; k++) {
      // vettore di Householder per colonna k
      s = 0;
      for (i = k; i < n; i++) s += X[i][k] * X[i][k];
      var nrm = Math.sqrt(s);
      if (nrm < 1e-300) { vs.push(null); Rdiag[k] = 0; continue; }
      alpha = X[k][k] > 0 ? -nrm : nrm;
      v = new Array(n).fill(0);
      for (i = k; i < n; i++) v[i] = X[i][k];
      v[k] -= alpha;
      vnorm = 0;
      for (i = k; i < n; i++) vnorm += v[i] * v[i];
      if (vnorm < 1e-300) { vs.push(null); Rdiag[k] = alpha; X[k][k] = alpha; continue; }
      vs.push({ v: v, vnorm: vnorm });
      // applica a X
      for (j = k; j < p; j++) {
        dot = 0;
        for (i = k; i < n; i++) dot += v[i] * X[i][j];
        dot = 2 * dot / vnorm;
        for (i = k; i < n; i++) X[i][j] -= dot * v[i];
      }
      // applica a b
      dot = 0;
      for (i = k; i < n; i++) dot += v[i] * b[i];
      dot = 2 * dot / vnorm;
      for (i = k; i < n; i++) b[i] -= dot * v[i];
      Rdiag[k] = X[k][k];
    }
    // R = parte triangolare superiore p x p
    var R = zeros(p, p);
    for (i = 0; i < Math.min(n, p); i++) for (j = i; j < p; j++) R[i][j] = X[i][j];
    // back-substitution
    var beta = new Array(p).fill(0);
    var rnk = 0;
    for (i = 0; i < p; i++) if (Math.abs(R[i][i]) > 1e-10) rnk++;
    for (i = p - 1; i >= 0; i--) {
      if (Math.abs(R[i][i]) < 1e-12) { beta[i] = 0; continue; }
      s = b[i];
      for (j = i + 1; j < p; j++) s -= R[i][j] * beta[j];
      beta[i] = s / R[i][i];
    }
    var rss = 0;
    for (i = Math.min(n, p); i < n; i++) rss += b[i] * b[i];
    return { beta: beta, R: R, qty: b, rss: rss, rank: rnk };
  }

  /**
   * Autovalori/autovettori di matrice simmetrica: Jacobi ciclico.
   * Ritorna { values: [...desc], vectors: colonne allineate a values }
   */
  function eigenSym(Ain, maxSweep) {
    var A = clone(Ain), n = A.length, V = identity(n);
    maxSweep = maxSweep || 100;
    var i, j, k, p, q, off;
    for (var sweep = 0; sweep < maxSweep; sweep++) {
      off = 0;
      for (p = 0; p < n - 1; p++) for (q = p + 1; q < n; q++) off += A[p][q] * A[p][q];
      if (off < 1e-24) break;
      for (p = 0; p < n - 1; p++) {
        for (q = p + 1; q < n; q++) {
          if (Math.abs(A[p][q]) < 1e-18) continue;
          var theta = (A[q][q] - A[p][p]) / (2 * A[p][q]);
          var t = Math.sign(theta || 1) / (Math.abs(theta) + Math.sqrt(theta * theta + 1));
          var c = 1 / Math.sqrt(t * t + 1), s = t * c;
          for (k = 0; k < n; k++) {
            var akp = A[k][p], akq = A[k][q];
            A[k][p] = c * akp - s * akq;
            A[k][q] = s * akp + c * akq;
          }
          for (k = 0; k < n; k++) {
            var apk = A[p][k], aqk = A[q][k];
            A[p][k] = c * apk - s * aqk;
            A[q][k] = s * apk + c * aqk;
          }
          for (k = 0; k < n; k++) {
            var vkp = V[k][p], vkq = V[k][q];
            V[k][p] = c * vkp - s * vkq;
            V[k][q] = s * vkp + c * vkq;
          }
        }
      }
    }
    var vals = [];
    for (i = 0; i < n; i++) vals.push({ v: A[i][i], idx: i });
    vals.sort(function (a, b) { return b.v - a.v; });
    var values = vals.map(function (o) { return o.v; });
    var vectors = zeros(n, n);
    for (j = 0; j < n; j++) {
      var src = vals[j].idx;
      // segno canonico: prima componente non nulla positiva
      var sgn = 1;
      for (i = 0; i < n; i++) {
        if (Math.abs(V[i][src]) > 1e-12) { sgn = V[i][src] > 0 ? 1 : -1; break; }
      }
      for (i = 0; i < n; i++) vectors[i][j] = sgn * V[i][src];
    }
    return { values: values, vectors: vectors };
  }

  /** Pseudo-inversa via eigen di A^T A (per matrici mal condizionate). */
  function pinv(A, tol) {
    var At = transpose(A), AtA = mul(At, A);
    var e = eigenSym(AtA);
    var n = AtA.length, i, j, k;
    var maxv = Math.max.apply(null, e.values.map(Math.abs));
    tol = tol || 1e-10 * maxv;
    var Dinv = zeros(n, n);
    for (i = 0; i < n; i++) Dinv[i][i] = Math.abs(e.values[i]) > tol ? 1 / e.values[i] : 0;
    var V = e.vectors;
    return mul(mul(mul(V, Dinv), transpose(V)), At);
  }

  function diag(A) { return A.map(function (r, i) { return r[i]; }); }

  function trace(A) {
    var s = 0;
    for (var i = 0; i < A.length; i++) s += A[i][i];
    return s;
  }

  return {
    zeros: zeros, identity: identity, clone: clone, transpose: transpose,
    mul: mul, mulVec: mulVec, addScaled: addScaled,
    crossprod: crossprod, crossvec: crossvec,
    cholesky: cholesky, solveSPD: solveSPD, inverse: inverse, det: det, rank: rank,
    qrSolve: qrSolve, eigenSym: eigenSym, pinv: pinv, diag: diag, trace: trace
  };
});
