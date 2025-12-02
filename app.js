const storageKey = 'chantier-local-data';
const defaultActivation = 'ADMIN-ACT';

const state = {
  data: loadData(),
  currentUser: null,
  currentSiteId: null,
  charts: { materials: null, workers: null },
};

function loadData() {
  const raw = localStorage.getItem(storageKey);
  if (!raw) return { users: [], activationPassword: null };
  try {
    return JSON.parse(raw);
  } catch (e) {
    console.warn('Resetting corrupted storage');
    return { users: [], activationPassword: null };
  }
}

function saveData() {
  localStorage.setItem(storageKey, JSON.stringify(state.data));
}

function hash(text) {
  return btoa(text).replace(/=/g, '');
}

function findUser(id) {
  return state.data.users.find((u) => u.id === id);
}

function authStatus(text) {
  document.getElementById('auth-status').textContent = text;
}

function showSections(authenticated) {
  const sections = ['dashboard', 'budget-section', 'records', 'transactions', 'history', 'settings', 'sites', 'inventory', 'donor'];
  sections.forEach((id) => document.getElementById(id).classList.toggle('hidden', !authenticated));
  document.getElementById('auth-section').classList.toggle('hidden', authenticated);
}

function initSite(user) {
  if (!user.sites || !user.sites.length) {
    user.sites = [{ id: crypto.randomUUID(), name: 'Chantier principal', archived: false, locked: false, budget: {}, materials: [], workers: [], locations: [], transactions: [], history: [], suggestions: { materials: [], trades: [], categories: [] }, donor: { budget: null, slices: [] } }];
  }
  state.currentSiteId = user.sites[0].id;
}

function formatCurrency(value) {
  return new Intl.NumberFormat('fr-FR', { style: 'currency', currency: 'XOF' }).format(value || 0);
}

function formatSar(value, rate) {
  return new Intl.NumberFormat('fr-FR', { style: 'currency', currency: 'SAR' }).format((value || 0) / (rate || 1));
}

function renderUser() {
  document.getElementById('current-user').textContent = `${state.currentUser.id} (${state.currentUser.role})`;
  document.getElementById('account-id').textContent = state.currentUser.id;
  document.body.classList.toggle('theme-sombre', state.currentUser.theme === 'sombre');
  document.body.classList.toggle('theme-clair', state.currentUser.theme !== 'sombre');
  renderAvatar(document.getElementById('user-avatar'), state.currentUser.avatar);
  renderAvatar(document.getElementById('avatar-preview'), state.currentUser.avatar);
}

function renderAvatar(img, src) {
  if (!img) return;
  if (src) {
    img.src = src;
    img.classList.remove('hidden');
  } else {
    img.classList.add('hidden');
    img.removeAttribute('src');
  }
}

function renderLockIndicator() {
  const site = currentSite();
  document.getElementById('readonly-indicator').textContent = site?.locked ? 'Lecture seule' : 'Lecture seule désactivée';
  renderSiteChip();
}

function renderSiteChip() {
  const chip = document.getElementById('site-chip');
  if (!chip) return;
  const site = currentSite();
  chip.textContent = site ? `Chantier : ${site.name}` : 'Chantier actif';
  chip.classList.toggle('warning', !!site?.locked);
}

function currentSite() {
  if (!state.currentUser) return null;
  return state.currentUser.sites.find((s) => s.id === state.currentSiteId);
}

function refreshSiteSelect() {
  const select = document.getElementById('site-select');
  select.innerHTML = '';
  state.currentUser.sites.filter((s) => !s.archived).forEach((site) => {
    const opt = document.createElement('option');
    opt.value = site.id;
    opt.textContent = site.name + (site.locked ? ' (verrouillé)' : '');
    select.appendChild(opt);
  });
  select.value = state.currentSiteId;
}

function renderIndicators() {
  const site = currentSite();
  const rate = site.budget?.sarRate || 1;
  const budgetInitial = site.budget?.initialBudget || 0;
  const expenses = site.transactions.reduce((sum, t) => sum + Number(t.amount || 0), 0);
  const materialCredits = site.materials.filter((m) => m.payment === 'credit').reduce((s, m) => s + Number(m.amount || 0), 0);
  const locationCredits = site.locations.filter((l) => l.mode === 'credit').reduce((s, l) => s + Number(l.price || 0) - Number(l.paid || 0), 0);
  const debts = materialCredits + locationCredits;
  const balance = budgetInitial - expenses - debts;

  document.getElementById('budget-sar').textContent = formatSar(budgetInitial, rate);
  document.getElementById('expenses-total').textContent = formatCurrency(expenses);
  document.getElementById('balance').textContent = formatCurrency(balance);
  document.getElementById('debts').textContent = formatCurrency(debts);

  renderSiteChip();
  
  document.getElementById('budget-initial').textContent = formatCurrency(budgetInitial);
  document.getElementById('budget-initial-sar').textContent = formatSar(budgetInitial, rate);
  const paid = expenses - debts;
  document.getElementById('budget-paid').textContent = formatCurrency(paid);
  document.getElementById('budget-debts').textContent = formatCurrency(debts);
  document.getElementById('sar-rate-setting').value = site.budget?.sarRate || 1;
  renderLockIndicator();
}

function renderTables() {
  const site = currentSite();
  const materialTable = document.getElementById('material-table');
  materialTable.innerHTML = '<tr><th>Nom</th><th>Montant</th><th>Mode</th><th>Date</th><th>Qté</th><th>Catégorie</th></tr>' +
    site.materials.map((m) => `<tr><td>${m.name}</td><td>${formatCurrency(m.amount)}</td><td>${m.payment}</td><td>${m.date}</td><td>${m.quantity}</td><td>${m.category || ''}</td></tr>`).join('');

  const filter = document.getElementById('worker-filter').value?.toLowerCase?.() || '';
  const workers = site.workers.filter((w) => !filter || w.trade.toLowerCase().includes(filter));
  const workerTable = document.getElementById('worker-table');
  workerTable.innerHTML = '<tr><th>Nom</th><th>Métier</th><th>Montant</th><th>Début</th></tr>' +
    workers.map((w) => `<tr><td>${w.name}</td><td>${w.trade}</td><td>${formatCurrency(w.amount)}</td><td>${w.start}</td></tr>`).join('');

  const locationTable = document.getElementById('location-table');
  locationTable.innerHTML = '<tr><th>Description</th><th>Étendue</th><th>Superficie</th><th>Prix</th><th>Payé</th><th>Date</th><th>Mode</th></tr>' +
    site.locations.map((l) => `<tr><td>${l.description}</td><td>${l.area}</td><td>${l.surface}</td><td>${formatCurrency(l.price)}</td><td>${formatCurrency(l.paid)}</td><td>${l.date}</td><td>${l.mode}</td></tr>`).join('');

  const unforeseenList = document.getElementById('unforeseen-list');
  const unforeseen = site.transactions.filter((t) => t.targetType === 'diverse');
  document.getElementById('unforeseen-total').textContent = formatCurrency(unforeseen.reduce((s, t) => s + Number(t.amount || 0), 0));
  unforeseenList.innerHTML = unforeseen.map((t) => `<div class="stat">${t.date} – ${t.note || 'Imprévu'} : ${formatCurrency(t.amount)}</div>`).join('');

  const historyTable = document.getElementById('history-table');
  historyTable.innerHTML = '<tr><th>Date</th><th>Type</th><th>Détail</th><th>Montant</th></tr>' +
    site.history.map((h) => `<tr><td>${h.date}</td><td>${h.type}</td><td>${h.detail}</td><td>${formatCurrency(h.amount)}</td></tr>`).join('');

  renderInventory();
  renderDonor();
}

function addHistory(type, detail, amount, date) {
  const site = currentSite();
  site.history.push({ type, detail, amount, date });
}

function renderInventory() {
  const site = currentSite();
  const materialTotal = site.materials.reduce((s, m) => s + Number(m.amount || 0), 0);
  const workerTotal = site.workers.reduce((s, w) => s + Number(w.amount || 0), 0);
  const expenseTotal = site.transactions.reduce((s, t) => s + Number(t.amount || 0), 0) + materialTotal + workerTotal;
  document.getElementById('inv-materials').textContent = formatCurrency(materialTotal);
  document.getElementById('inv-workers').textContent = formatCurrency(workerTotal);
  document.getElementById('inv-total').textContent = formatCurrency(expenseTotal);

  const materialByCategory = site.materials.reduce((acc, m) => {
    acc[m.category || 'Autre'] = (acc[m.category || 'Autre'] || 0) + Number(m.amount || 0);
    return acc;
  }, {});
  const workerByTrade = site.workers.reduce((acc, w) => {
    acc[w.trade || 'Divers'] = (acc[w.trade || 'Divers'] || 0) + Number(w.amount || 0);
    return acc;
  }, {});

  renderChart('material-chart', Object.keys(materialByCategory), Object.values(materialByCategory), 'Matériaux par catégorie', 'materials');
  renderChart('worker-chart', Object.keys(workerByTrade), Object.values(workerByTrade), 'Ouvriers par métier', 'workers');

  const tables = document.getElementById('inventory-tables');
  tables.innerHTML = `
    <h3>Matériaux</h3>
    <table><tr><th>Catégorie</th><th>Total</th></tr>${Object.entries(materialByCategory).map(([c,v]) => `<tr><td>${c}</td><td>${formatCurrency(v)}</td></tr>`).join('')}</table>
    <h3>Ouvriers</h3>
    <table><tr><th>Métier</th><th>Total</th></tr>${Object.entries(workerByTrade).map(([c,v]) => `<tr><td>${c}</td><td>${formatCurrency(v)}</td></tr>`).join('')}</table>
  `;
}

function renderChart(canvasId, labels, data, label, key) {
  const ctx = document.getElementById(canvasId);
  if (state.charts[key]) state.charts[key].destroy();
  state.charts[key] = new Chart(ctx, {
    type: 'bar',
    data: { labels, datasets: [{ label, data, backgroundColor: '#60a5fa' }] },
    options: { responsive: true, scales: { y: { beginAtZero: true } } },
  });
}

function renderDonor() {
  const site = currentSite();
  const donor = site.donor || { budget: null, slices: [] };
  const table = document.getElementById('donor-table');
  table.innerHTML = '<tr><th>Date</th><th>Projet</th><th>Pays/Ville</th><th>Montant</th><th>Devise</th></tr>' +
    donor.slices.map((s) => `<tr><td>${s.date}</td><td>${s.project}</td><td>${s.country} / ${s.city}</td><td>${s.amount}</td><td>${s.currency}</td></tr>`).join('');
  const remaining = (donor.budget?.amount || 0) - donor.slices.reduce((s, sl) => s + Number(sl.amount || 0), 0);
  document.getElementById('donor-remaining').textContent = `Budget restant: ${remaining}`;
  document.getElementById('donor-active').textContent = `Tranches actives: ${donor.slices.length}`;
}

function ensureAdmin(action) {
  if (state.currentUser.role !== 'admin') {
    alert('Action réservée aux administrateurs');
    return false;
  }
  return true;
}

function ensureWritable(message = 'Chantier verrouillé en lecture seule') {
  const site = currentSite();
  if (site?.locked) {
    alert(message);
    return false;
  }
  return true;
}

function requireAdminPassword() {
  if (!ensureAdmin()) return false;
  const attempt = prompt('Confirmez avec le mot de passe administrateur');
  if (state.currentUser.password !== hash(attempt || '')) {
    alert('Mot de passe administrateur invalide');
    return false;
  }
  return true;
}

// Auth handlers

document.getElementById('register-form').addEventListener('submit', (e) => {
  e.preventDefault();
  const form = new FormData(e.target);
  const id = form.get('registerId');
  const password = form.get('registerPassword');
  const confirm = form.get('registerConfirm');
  const role = form.get('role');
  const activation = form.get('activation');

  if (password !== confirm) return alert('Mot de passe non confirmé');
  if (role === 'admin' && state.data.activationPassword && state.data.activationPassword !== activation) {
    return alert('Mot de passe d\'activation requis pour un administrateur');
  }
  if (findUser(id)) return alert('Identifiant déjà utilisé');

  const user = { id, password: hash(password), role, theme: 'clair', sites: [] };
  state.data.users.push(user);
  saveData();
  alert('Compte créé, vous pouvez vous connecter.');
  e.target.reset();
});

document.getElementById('login-form').addEventListener('submit', (e) => {
  e.preventDefault();
  const form = new FormData(e.target);
  const id = form.get('loginId');
  const password = form.get('loginPassword');
  const user = findUser(id);
  if (!user || user.password !== hash(password)) return alert('Identifiants invalides');
  state.currentUser = user;
  initSite(user);
  authStatus(`Connecté en local en tant que ${id}`);
  showSections(true);
  refreshSiteSelect();
  renderUser();
  renderIndicators();
  renderTables();
});

document.getElementById('logout').addEventListener('click', () => {
  state.currentUser = null;
  showSections(false);
  authStatus('Non connecté');
});

// Budget form

document.getElementById('budget-form').addEventListener('submit', (e) => {
  e.preventDefault();
  if (!ensureAdmin() || !ensureWritable()) return;
  const form = new FormData(e.target);
  const site = currentSite();
  site.budget = { initialBudget: Number(form.get('initialBudget')), sarRate: Number(form.get('sarRate')), note: form.get('note') };
  addHistory('budget', 'Budget initial', site.budget.initialBudget, new Date().toISOString().slice(0,10));
  saveData();
  renderIndicators();
  renderTables();
});

// Material, worker, location forms

document.getElementById('material-form').addEventListener('submit', (e) => {
  e.preventDefault();
  if (!ensureWritable()) return;
  const form = new FormData(e.target);
  const site = currentSite();
  site.materials.push({
    name: form.get('name'),
    amount: Number(form.get('amount')),
    payment: form.get('payment'),
    date: form.get('date'),
    quantity: Number(form.get('quantity')),
    category: form.get('category'),
  });
  addHistory('material', form.get('name'), Number(form.get('amount')), form.get('date'));
  saveData();
  e.target.reset();
  renderIndicators();
  renderTables();
});

document.getElementById('worker-form').addEventListener('submit', (e) => {
  e.preventDefault();
  if (!ensureWritable()) return;
  const form = new FormData(e.target);
  const site = currentSite();
  site.workers.push({ name: form.get('name'), trade: form.get('trade'), amount: Number(form.get('amount')), start: form.get('start') });
  addHistory('worker', form.get('name'), Number(form.get('amount')), form.get('start'));
  saveData();
  e.target.reset();
  renderIndicators();
  renderTables();
});

document.getElementById('worker-filter').addEventListener('input', renderTables);

document.getElementById('location-form').addEventListener('submit', (e) => {
  e.preventDefault();
  if (!ensureWritable()) return;
  const form = new FormData(e.target);
  const site = currentSite();
  site.locations.push({
    description: form.get('description'),
    area: form.get('area'),
    surface: Number(form.get('surface')),
    price: Number(form.get('price')),
    paid: Number(form.get('paid')),
    date: form.get('date'),
    mode: form.get('mode'),
  });
  addHistory('location', form.get('description'), Number(form.get('price')), form.get('date'));
  saveData();
  e.target.reset();
  renderIndicators();
  renderTables();
});

// Transactions

document.getElementById('transaction-form').addEventListener('submit', (e) => {
  e.preventDefault();
  if (!ensureWritable()) return;
  const form = new FormData(e.target);
  const site = currentSite();
  const entry = {
    targetType: form.get('targetType'),
    target: form.get('target'),
    amount: Number(form.get('amount')),
    date: form.get('date'),
    note: form.get('note'),
  };
  site.transactions.push(entry);
  addHistory('transaction', `${entry.targetType} - ${entry.target}`, entry.amount, entry.date);
  saveData();
  e.target.reset();
  renderIndicators();
  renderTables();
});

// History filters

document.getElementById('history-filters').addEventListener('submit', (e) => {
  e.preventDefault();
  const form = new FormData(e.target);
  const type = form.get('type');
  const name = form.get('name');
  const from = form.get('from');
  const to = form.get('to');
  const site = currentSite();
  const filtered = site.history.filter((h) => {
    if (type && h.type !== type) return false;
    if (name && !h.detail.toLowerCase().includes(name.toLowerCase())) return false;
    if (from && h.date < from) return false;
    if (to && h.date > to) return false;
    return true;
  });
  const table = document.getElementById('history-table');
  table.innerHTML = '<tr><th>Date</th><th>Type</th><th>Détail</th><th>Montant</th></tr>' +
    filtered.map((h) => `<tr><td>${h.date}</td><td>${h.type}</td><td>${h.detail}</td><td>${formatCurrency(h.amount)}</td></tr>`).join('');
});

document.getElementById('reset-history').addEventListener('click', renderTables);

// Settings

document.getElementById('toggle-theme').addEventListener('click', () => {
  state.currentUser.theme = state.currentUser.theme === 'sombre' ? 'clair' : 'sombre';
  saveData();
  renderUser();
});

document.getElementById('avatar').addEventListener('change', (e) => {
  const file = e.target.files?.[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = () => {
    state.currentUser.avatar = reader.result;
    saveData();
    renderUser();
  };
  reader.readAsDataURL(file);
});

document.getElementById('update-account').addEventListener('click', () => {
  const newId = document.getElementById('new-id').value;
  const newPass = document.getElementById('new-password').value;
  if (newId && findUser(newId)) return alert('Identifiant déjà pris');
  if (newId) state.currentUser.id = newId;
  if (newPass) state.currentUser.password = hash(newPass);
  saveData();
  renderUser();
});

document.getElementById('update-activation').addEventListener('click', () => {
  if (!ensureAdmin()) return;
  const value = document.getElementById('activation-password').value;
  state.data.activationPassword = value ? value : null;
  saveData();
  alert('Mot de passe d\'activation mis à jour');
});

document.getElementById('update-sar-rate').addEventListener('click', () => {
  if (!requireAdminPassword() || !ensureWritable()) return;
  const rate = Number(document.getElementById('sar-rate-setting').value || 1);
  const site = currentSite();
  site.budget = site.budget || {};
  site.budget.sarRate = rate;
  saveData();
  renderIndicators();
});

// Sites management

document.getElementById('site-select').addEventListener('change', (e) => {
  state.currentSiteId = e.target.value;
  renderIndicators();
  renderTables();
});

document.getElementById('rename-site').addEventListener('click', () => {
  if (!ensureWritable('Chantier verrouillé, déverrouillez pour modifier.')) return;
  const name = document.getElementById('site-name').value;
  if (!name) return;
  currentSite().name = name;
  saveData();
  refreshSiteSelect();
});

document.getElementById('duplicate-site').addEventListener('click', () => {
  if (!ensureWritable('Chantier verrouillé, déverrouillez pour dupliquer.')) return;
  const site = currentSite();
  const copy = JSON.parse(JSON.stringify(site));
  copy.id = crypto.randomUUID();
  copy.name = site.name + ' (copie)';
  state.currentUser.sites.push(copy);
  saveData();
  refreshSiteSelect();
});

document.getElementById('archive-site').addEventListener('click', () => { if (!ensureWritable()) return; currentSite().archived = true; saveData(); refreshSiteSelect(); });
document.getElementById('restore-site').addEventListener('click', () => { if (!ensureWritable()) return; state.currentUser.sites.forEach((s) => s.archived = false); saveData(); refreshSiteSelect(); });
document.getElementById('lock-site').addEventListener('click', () => { currentSite().locked = !currentSite().locked; saveData(); renderLockIndicator(); });
document.getElementById('delete-site').addEventListener('click', () => {
  if (!ensureWritable('Chantier verrouillé, déverrouillez pour supprimer.')) return;
  if (!confirm('Supprimer ce chantier ?')) return;
  state.currentUser.sites = state.currentUser.sites.filter((s) => s.id !== state.currentSiteId);
  if (!state.currentUser.sites.length) initSite(state.currentUser);
  state.currentSiteId = state.currentUser.sites[0].id;
  saveData();
  refreshSiteSelect();
  renderIndicators();
  renderTables();
});

document.getElementById('save-suggestions').addEventListener('click', () => {
  if (!ensureWritable()) return;
  const site = currentSite();
  site.suggestions.materials.push(document.getElementById('custom-material').value);
  site.suggestions.trades.push(document.getElementById('custom-trade').value);
  site.suggestions.categories.push(document.getElementById('custom-category').value);
  saveData();
  alert('Suggestions enregistrées');
});

document.getElementById('export-json').addEventListener('click', () => {
  const blob = new Blob([JSON.stringify(state.data, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = 'sauvegarde-chantier.json'; a.click();
  URL.revokeObjectURL(url);
});

document.getElementById('import-json').addEventListener('click', () => {
  const content = prompt('Collez le JSON à importer');
  if (!content) return;
  try {
    state.data = JSON.parse(content);
    saveData();
    alert('Import réussi, reconnectez-vous');
    location.reload();
  } catch (e) {
    alert('JSON invalide');
  }
});

document.getElementById('export-pdf').addEventListener('click', () => alert('Export PDF simulé en local.'));
document.getElementById('export-excel').addEventListener('click', () => alert('Export Excel simulé en local.'));
document.getElementById('export-pdf-all').addEventListener('click', () => alert('Export PDF tous chantiers (simulation).'));
document.getElementById('export-zip').addEventListener('click', () => alert('Export ZIP simulé.'));

document.getElementById('inventory-pdf').addEventListener('click', () => alert('Export PDF inventaire (simulation).'));
document.getElementById('inventory-excel').addEventListener('click', () => alert('Export Excel inventaire (simulation).'));

document.getElementById('go-inventory').addEventListener('click', () => document.getElementById('inventory').scrollIntoView({ behavior: 'smooth' }));
document.getElementById('go-settings').addEventListener('click', () => document.getElementById('settings').scrollIntoView({ behavior: 'smooth' }));

document.getElementById('open-donor').addEventListener('click', () => document.getElementById('donor').scrollIntoView({ behavior: 'smooth' }));

document.getElementById('site-name').addEventListener('input', (e) => {
  if (currentSite()) e.target.placeholder = currentSite().name;
});

document.getElementById('journal').addEventListener('input', (e) => {
  if (!ensureWritable()) return;
  const site = currentSite();
  site.journal = e.target.value;
  saveData();
});

// Donor budget

document.getElementById('save-donor-budget').addEventListener('click', () => {
  if (!ensureWritable()) return;
  const site = currentSite();
  site.donor = site.donor || { budget: null, slices: [] };
  site.donor.budget = { name: document.getElementById('donor-budget-name').value, amount: Number(document.getElementById('donor-budget-amount').value || 0), rate: Number(document.getElementById('donor-rate').value || 1) };
  saveData();
  renderDonor();
});

document.getElementById('add-donor-slice').addEventListener('click', () => {
  const today = new Date().toISOString().slice(0,10);
  const date = document.getElementById('donor-date').value;
  if (date > today) return alert('La date ne peut pas être dans le futur');
  if (!ensureWritable()) return;
  const site = currentSite();
  site.donor = site.donor || { budget: null, slices: [] };
  site.donor.slices.push({
    date,
    project: document.getElementById('donor-project').value,
    country: document.getElementById('donor-country').value,
    city: document.getElementById('donor-city').value,
    amount: Number(document.getElementById('donor-amount').value || 0),
    currency: document.getElementById('donor-currency').value,
  });
  saveData();
  renderDonor();
});

document.getElementById('donor-export-csv').addEventListener('click', () => alert('Export CSV donateur simulé.'));
document.getElementById('donor-export-pdf').addEventListener('click', () => alert('Export PDF donateur simulé.'));

// History initialization
function initHistory() {
  const site = currentSite();
  document.getElementById('history-table').innerHTML = '<tr><th>Date</th><th>Type</th><th>Détail</th><th>Montant</th></tr>' +
    site.history.map((h) => `<tr><td>${h.date}</td><td>${h.type}</td><td>${h.detail}</td><td>${formatCurrency(h.amount)}</td></tr>`).join('');
}

// Tab handling

document.querySelectorAll('.tabs button').forEach((btn) => {
  btn.addEventListener('click', () => {
    document.querySelectorAll('.tabs button').forEach((b) => b.classList.remove('active'));
    btn.classList.add('active');
    const tab = btn.dataset.tab;
    document.querySelectorAll('.tab-panel').forEach((panel) => panel.classList.add('hidden'));
    document.getElementById(tab).classList.remove('hidden');
  });
});

// On load
showSections(false);
authStatus('Non connecté');
