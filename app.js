// ============================================================
// FIREBASE CONFIG
// ============================================================
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-app.js";
import { getAuth, signInWithRedirect, signInWithPopup, getRedirectResult, GoogleAuthProvider, signOut, onAuthStateChanged }
  from "https://www.gstatic.com/firebasejs/10.12.0/firebase-auth.js";
import { getFirestore, doc, getDoc, setDoc, addDoc, updateDoc, deleteDoc,
  collection, query, where, orderBy, getDocs, onSnapshot, Timestamp }
  from "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js";

const firebaseConfig = {
  apiKey: "AIzaSyD5z7i9SWwNcB0ickzJpGU_Ooh6NfwKrKM",
  authDomain: "neoappleone.firebaseapp.com",
  projectId: "neoappleone",
  storageBucket: "neoappleone.firebasestorage.app",
  messagingSenderId: "394438008236",
  appId: "1:394438008236:web:606235c9cf196ea2aa6e09"
};

const app  = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db   = getFirestore(app);

const MASTER_EMAIL = "davimafioleti@live.com";

function normalizarEmail(email) {
  return (email || "").trim().toLowerCase();
}

function pendingUserIdFromEmail(email) {
  return "pending_" + normalizarEmail(email).replace(/[@.]/g, "_");
}

async function sincronizarUsuarioAutorizado(user) {
  const emailUsuario = normalizarEmail(user.email);
  const masterEmail  = normalizarEmail(MASTER_EMAIL);
  const ref = doc(db, "usuarios", user.uid);
  const snap = await getDoc(ref);

  if (snap.exists()) {
    const data = snap.data();
    if (!data.ativo) {
      throw new Error("USER_DISABLED");
    }
    return data;
  }

  const pendingRef  = doc(db, "usuarios", pendingUserIdFromEmail(emailUsuario));
  const pendingSnap = await getDoc(pendingRef);

  if (pendingSnap.exists()) {
    const pending = pendingSnap.data();
    if (!pending.ativo) {
      throw new Error("USER_DISABLED");
    }

    const novoData = {
      nome: pending.nome || user.displayName || emailUsuario,
      email: emailUsuario,
      perfil: pending.perfil || "membro",
      ativo: true,
      criadoEm: pending.criadoEm || Timestamp.now(),
      atualizadoEm: Timestamp.now()
    };
    await setDoc(ref, novoData);
    await deleteDoc(pendingRef);
    return novoData;
  }

  if (emailUsuario === masterEmail) {
    const masterData = {
      nome: user.displayName || "Administrador",
      email: emailUsuario,
      perfil: "master",
      ativo: true,
      criadoEm: Timestamp.now()
    };
    await setDoc(ref, masterData);
    return masterData;
  }

  throw new Error("UNAUTHORIZED_EMAIL");
}

// ============================================================
// CAPTURA RESULTADO DO REDIRECT (roda ao voltar do Google)
// ============================================================
getRedirectResult(auth).then(async (result) => {
  if (!result || !result.user) return;
  const user = result.user;
  await sincronizarUsuarioAutorizado(user);
  window.location.href = "dashboard.html";
}).catch((e) => {
  if (e?.message === "UNAUTHORIZED_EMAIL") {
    signOut(auth);
    alert("Acesso não autorizado para este e-mail. Solicite ao administrador.");
    return;
  }
  if (e?.message === "USER_DISABLED") {
    signOut(auth);
    alert("Usuário desativado. Contate o administrador.");
    return;
  }
  console.error(e);
  alert("Erro ao fazer login: " + e.message);
});

// ============================================================
// AUTH
// ============================================================
async function loginGoogle() {
  const provider = new GoogleAuthProvider();
  try {
    const result = await signInWithPopup(auth, provider);
    if (result?.user) {
      await sincronizarUsuarioAutorizado(result.user);
      window.location.href = "dashboard.html";
    }
  } catch (e) {
    // Em alguns navegadores o redirect falha com "missing initial state".
    // Por isso, se popup estiver bloqueado, orienta liberar popup para este site.
    const popupBlocked = e?.code === "auth/popup-blocked" || e?.code === "auth/cancelled-popup-request";
    if (popupBlocked) {
      alert("O navegador bloqueou o popup de login. Libere popups para este site e tente novamente.");
      return;
    }
    if (e?.message === "UNAUTHORIZED_EMAIL") {
      await signOut(auth);
      alert("Acesso não autorizado para este e-mail. Solicite ao administrador.");
      return;
    }
    if (e?.message === "USER_DISABLED") {
      await signOut(auth);
      alert("Usuário desativado. Contate o administrador.");
      return;
    }
    throw e;
  }
}

async function logout() {
  await signOut(auth);
  window.location.href = "index.html";
}

async function getUserData(uid) {
  const snap = await getDoc(doc(db, "usuarios", uid));
  return snap.exists() ? snap.data() : null;
}

function requireAuth(callback) {
  onAuthStateChanged(auth, async (user) => {
    const loading = document.getElementById("loading");
    if (!user) {
      window.location.href = "index.html";
      return;
    }
    try {
      const data = await sincronizarUsuarioAutorizado(user);
      if (loading) loading.style.display = "none";
      callback(user, data);
    } catch (e) {
      await signOut(auth);
      if (e?.message === "USER_DISABLED") {
        alert("Usuário desativado. Contate o administrador.");
      } else if (e?.message === "UNAUTHORIZED_EMAIL") {
        alert("Acesso não autorizado para este e-mail. Solicite ao administrador.");
      }
      window.location.href = "index.html";
    }
  });
}

function preencherSidebar(userData) {
  const nomeEl   = document.getElementById("sb-nome");
  const perfilEl = document.getElementById("sb-perfil");
  if (nomeEl)   nomeEl.textContent   = userData.nome;
  if (perfilEl) perfilEl.textContent = userData.perfil.toUpperCase();

  const menuUsuarios = document.getElementById("menu-usuarios");
  if (menuUsuarios && userData.perfil !== "master") {
    menuUsuarios.style.display = "none";
  }
}

// ============================================================
// UTILITÁRIOS
// ============================================================
function fmt(valor) {
  if (isNaN(valor)) return "R$ 0,00";
  return "R$ " + Number(valor).toFixed(2)
    .replace(".", ",")
    .replace(/\B(?=(\d{3})+(?!\d))/g, ".");
}

function fmtData(ts) {
  if (!ts) return "—";
  const d = ts.toDate ? ts.toDate() : new Date(ts);
  return d.toLocaleDateString("pt-BR");
}

function calcPrecoFinal(precoCompra, freteCompra, brinde, freteVenda, imposto, margem) {
  const custoTotal = precoCompra + freteCompra + brinde + freteVenda;
  const divisor    = 1 - (imposto / 100) - (margem / 100);
  if (divisor <= 0) return null;
  return custoTotal / divisor;
}

function calcParcelas(saldo, numParcelas, jurosMensal) {
  const i = jurosMensal / 100;
  if (i === 0) return saldo / numParcelas;
  return saldo * i / (1 - Math.pow(1 + i, -numParcelas));
}

// ============================================================
// EXPORTAÇÕES
// ============================================================
export {
  auth, db, loginGoogle, logout, requireAuth, preencherSidebar,
  getUserData, fmt, fmtData, calcPrecoFinal, calcParcelas,
  MASTER_EMAIL, Timestamp, doc, getDoc, setDoc, addDoc, updateDoc,
  deleteDoc, collection, query, where, orderBy, getDocs, onSnapshot
};