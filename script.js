// EFA — Education For All (versão GitHub Pages)
// Textos e contas: Firebase (Firestore + Authentication). PDFs e imagens: Supabase Storage (links públicos).
import { initializeApp } from "https://www.gstatic.com/firebasejs/13.2.0/firebase-app.js";
import {
  getFirestore, collection, getDocs, query, where, doc, getDoc, setDoc,
} from "https://www.gstatic.com/firebasejs/13.2.0/firebase-firestore.js";
import {
  getAuth, onAuthStateChanged, signInWithPopup, GoogleAuthProvider,
  signInWithEmailAndPassword, createUserWithEmailAndPassword, signOut,
} from "https://www.gstatic.com/firebasejs/13.2.0/firebase-auth.js";

const firebaseConfig = {
  apiKey: "AIzaSyBYJTrWNmQWjmZGvDvnfoR9sdVhY-w8aKA",
  authDomain: "efa--education-for-all.firebaseapp.com",
  projectId: "efa--education-for-all",
  storageBucket: "efa--education-for-all.firebasestorage.app",
  messagingSenderId: "1081868455821",
  appId: "1:1081868455821:web:efb90dedf9f6d8885977c4",
};

const app = initializeApp(firebaseConfig);
const db = getFirestore(app);
const auth = getAuth(app);
const $ = (id) => document.getElementById(id);

let materiais = [];
let ehAdmin = false;

// ---------- utilidades ----------
const esc = (s) =>
  String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const seguro = (url) => (/^https:\/\//.test(url || "") ? url : "");
const texto = (s) => esc(s).replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>").replace(/\n/g, "<br>");
const norm = (s) => String(s ?? "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();

// ---------- catálogo ----------
async function carregar() {
  try {
    const snap = await getDocs(query(collection(db, "materials"), where("status", "==", "approved")));
    materiais = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
    materiais.sort((a, b) => (a.order ?? 0) - (b.order ?? 0) || String(b.created_date).localeCompare(String(a.created_date)));
    preencherFiltros();
    desenhar();
  } catch (e) {
    console.error(e);
    $("status").textContent =
      e.code === "permission-denied"
        ? "Sem permissão para ler os materiais. Confira as regras do Firestore."
        : "Não foi possível carregar os materiais agora.";
  }
}

function preencherFiltros() {
  const opcoes = (campo) => [...new Set(materiais.map((m) => m[campo]).filter(Boolean))].sort((a, b) => a.localeCompare(b, "pt"));
  [["f-disciplina", "discipline"], ["f-publico", "audience"]].forEach(([id, campo]) => {
    const sel = $(id);
    sel.querySelectorAll("option:not([value=''])").forEach((o) => o.remove());
    opcoes(campo).forEach((v) => sel.add(new Option(v, v)));
  });
}

function desenhar() {
  const q = norm($("busca").value);
  const disc = $("f-disciplina").value;
  const pub = $("f-publico").value;
  const lista = materiais.filter(
    (m) =>
      (!disc || m.discipline === disc) &&
      (!pub || m.audience === pub) &&
      (!q || norm([m.title, m.summary, m.topic, m.discipline, m.audience].join(" ")).includes(q))
  );
  $("status").textContent = lista.length ? `${lista.length} material(is) encontrado(s)` : "Nenhum material encontrado.";
  const grade = $("catalogo");
  grade.innerHTML = "";
  lista.forEach((m) => {
    const b = document.createElement("button");
    b.className = "card";
    b.innerHTML = `
      ${seguro(m.cover_image) ? `<img src="${esc(seguro(m.cover_image))}" alt="${esc(m.image_alt || "")}" loading="lazy">` : ""}
      <div class="card-corpo">
        <div class="tags">${[m.discipline, m.audience].filter(Boolean).map((t) => `<span class="tag">${esc(t)}</span>`).join("")}</div>
        <h3>${esc(m.title)}</h3>
        <p>${esc(m.summary)}</p>
      </div>`;
    b.addEventListener("click", () => abrirMaterial(m));
    grade.appendChild(b);
  });
}

function abrirMaterial(m) {
  const anexos = (m.attachments?.length ? m.attachments : m.file_uri ? [{ name: m.file_name || "Material", url: m.file_uri }] : [])
    .filter((a) => seguro(a.url));
  $("dlg-corpo").innerHTML = `
    ${seguro(m.cover_image) ? `<img src="${esc(seguro(m.cover_image))}" alt="${esc(m.image_alt || "")}">` : ""}
    <div class="tags">${[m.discipline, m.topic, m.format, m.audience].filter(Boolean).map((t) => `<span class="tag">${esc(t)}</span>`).join("")}</div>
    <h2>${esc(m.title)}</h2>
    <p>${texto(m.description)}</p>
    ${m.content ? `<h3>Conteúdo</h3><div class="conteudo">${texto(m.content)}</div>` : ""}
    ${m.accessibility_notes ? `<h3>Acessibilidade</h3><p>${texto(m.accessibility_notes)}</p>` : ""}
    ${m.author_name || m.author_institution ? `<p><small>${esc([m.author_name, m.author_institution].filter((x) => x && x !== "None").join(" · "))}</small></p>` : ""}
    <div class="linha">
      ${anexos.map((a) => `<a class="btn" href="${esc(a.url)}" target="_blank" rel="noopener">Abrir ${esc(a.name || "arquivo")}</a>`).join("")}
      ${seguro(m.external_link) ? `<a class="btn btn-claro" href="${esc(m.external_link)}" target="_blank" rel="noopener">Link externo</a>` : ""}
    </div>`;
  $("dlg-material").showModal();
}

["busca", "f-disciplina", "f-publico"].forEach((id) => $(id).addEventListener("input", desenhar));
document.querySelectorAll("[data-fechar]").forEach((b) => b.addEventListener("click", () => b.closest("dialog").close()));
document.querySelectorAll("dialog").forEach((d) =>
  d.addEventListener("click", (e) => { if (e.target === d) d.close(); })
);

// ---------- login ----------
const msgErro = (e) =>
  ({
    "auth/invalid-credential": "E-mail ou senha incorretos.",
    "auth/email-already-in-use": "Este e-mail já tem conta. Use Entrar.",
    "auth/weak-password": "Use uma senha com pelo menos 6 caracteres.",
    "auth/invalid-email": "E-mail inválido.",
    "auth/unauthorized-domain": "Este endereço do site ainda não foi liberado no Firebase (Authentication → Configurações → Domínios autorizados).",
    "auth/popup-closed-by-user": "A janela do Google foi fechada.",
  }[e.code] || "Não foi possível entrar. Tente de novo.");

$("btn-entrar").addEventListener("click", () => { $("login-erro").textContent = ""; $("dlg-login").showModal(); });
$("btn-sair").addEventListener("click", () => signOut(auth));

async function tentar(fn) {
  $("login-erro").textContent = "";
  try { await fn(); $("dlg-login").close(); } catch (e) { $("login-erro").textContent = msgErro(e); }
}
$("btn-google").addEventListener("click", () => tentar(() => signInWithPopup(auth, new GoogleAuthProvider())));
$("form-login").addEventListener("submit", (e) => {
  e.preventDefault();
  tentar(() => signInWithEmailAndPassword(auth, $("login-email").value.trim(), $("login-senha").value));
});
$("btn-criar").addEventListener("click", () => {
  if (!$("form-login").reportValidity()) return;
  tentar(() => createUserWithEmailAndPassword(auth, $("login-email").value.trim(), $("login-senha").value));
});

onAuthStateChanged(auth, async (user) => {
  $("btn-entrar").hidden = !!user;
  $("btn-sair").hidden = !user;
  $("usuario").hidden = !user;
  $("usuario").textContent = user ? user.displayName || user.email : "";
  ehAdmin = false;
  if (user) {
    try { ehAdmin = (await getDoc(doc(db, "admins", user.uid))).exists(); } catch { ehAdmin = false; }
  }
  $("admin").hidden = !ehAdmin;
});

// ---------- importação (só administrador) ----------
$("btn-importar").addEventListener("click", async () => {
  const log = (t) => ($("log-import").textContent += t + "\n");
  $("log-import").textContent = "";
  const arq = $("arq-import").files[0];
  if (!arq) return log("Escolha o arquivo efa-dados.json primeiro.");
  if (!ehAdmin) return log("Só o administrador pode importar.");
  try {
    const dados = JSON.parse(await arq.text());
    const grupos = [["materials", dados.materials || []], ["categories", dados.categories || []]];
    for (const [nome, itens] of grupos) {
      let n = 0;
      for (const item of itens) {
        const { id, ...resto } = item;
        await setDoc(doc(db, nome, id), resto);
        log(`${nome}: ${++n}/${itens.length}`);
      }
    }
    for (const [id, valor] of Object.entries(dados.siteConfig || {})) {
      await setDoc(doc(db, "siteConfig", id), valor);
      log(`siteConfig/${id} salvo`);
    }
    log("Pronto! Recarregue a página.");
  } catch (e) {
    log("Erro: " + (e.code === "permission-denied" ? "sem permissão (confira as regras e o documento em admins)." : e.message));
  }
});

carregar();
