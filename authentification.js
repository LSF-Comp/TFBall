const localUsersStorageKey = 'tfball-local-users';
const localCurrentUserKey = 'tfball-current-user';

function readLocalUsers() {
    try {
        return JSON.parse(localStorage.getItem(localUsersStorageKey) || '{}');
    } catch (e) {
        return {};
    }
}

function writeLocalUsers(users) {
    localStorage.setItem(localUsersStorageKey, JSON.stringify(users));
}

window.fbAuth = null;
window.fbDb = null;
window.fbDoc = null;
window.fbSetDoc = null;
window.fbGetDoc = null;
window.fbCollection = null;
window.fbQuery = null;
window.fbWhere = null;
window.fbGetDocs = null;

window.Auth = {
    isLoginMode: true,
    currentUser: null,
    signupRole: 'manager',

    init() {
        const savedUser = localStorage.getItem(localCurrentUserKey);
        if (savedUser) {
            try {
                const parsed = JSON.parse(savedUser);
                this.currentUser = parsed;
                if (window.App && typeof window.App.updateCurrentUserDisplay === 'function') {
                    window.App.updateCurrentUserDisplay();
                }
                document.getElementById('screen-auth').classList.add('hidden');
                if (window.App && typeof window.App.loadFromFirebase === 'function') {
                    window.App.loadFromFirebase(parsed.uid, parsed.email);
                }
                return;
            } catch (e) {
                localStorage.removeItem(localCurrentUserKey);
            }
        }

        if (window.App && typeof window.App.showScreen === 'function') {
            window.App.showScreen('screen-auth');
        }
    },

    toggleMode() {
        this.isLoginMode = !this.isLoginMode;
        const title = document.getElementById('auth-title');
        const btn = document.getElementById('btn-auth-primary');
        const link = document.getElementById('auth-toggle-link');
        const roleContainer = document.getElementById('signup-role-container');

        if (this.isLoginMode) {
            title.textContent = "🔐 Connexion Organisateur";
            btn.textContent = "Se connecter";
            link.textContent = "Créer un compte";
            if (roleContainer) roleContainer.classList.add('hidden');
        } else {
            title.textContent = "📝 Inscription Manager d'équipe";
            btn.textContent = "S'inscrire comme manager";
            link.textContent = "Déjà un compte ? Connexion";
            if (roleContainer) roleContainer.classList.remove('hidden');
        }
    },

    async submit() {
        const email = document.getElementById('auth-email').value.trim();
        const password = document.getElementById('auth-password').value;

        if (!email || !password) {
            alert("Veuillez remplir tous les champs.");
            return;
        }
        if (password.length < 6) {
            alert("Le mot de passe doit contenir au moins 6 caractères.");
            return;
        }

        try {
            const users = readLocalUsers();
            const normalizedEmail = email.toLowerCase();

            if (this.isLoginMode) {
                const storedUser = users[normalizedEmail];
                if (!storedUser || storedUser.password !== password) {
                    alert("Compte local introuvable. Créez d’abord un compte local.");
                    return;
                }
                this.currentUser = { uid: storedUser.uid, email: storedUser.email };
                localStorage.setItem(localCurrentUserKey, JSON.stringify(this.currentUser));
                if (window.App && typeof window.App.updateCurrentUserDisplay === 'function') {
                    window.App.updateCurrentUserDisplay();
                }
                document.getElementById('screen-auth').classList.add('hidden');
                if (window.App && typeof window.App.loadFromFirebase === 'function') {
                    window.App.loadFromFirebase(this.currentUser.uid, this.currentUser.email);
                }
            } else {
                if (users[normalizedEmail]) {
                    alert("Ce compte local existe déjà.");
                    return;
                }
                const selectedRole = document.getElementById('signup-role-select') ? document.getElementById('signup-role-select').value : 'manager';
                const newUser = {
                    uid: 'local-' + Date.now(),
                    email,
                    password,
                    role: selectedRole || 'manager'
                };
                users[normalizedEmail] = newUser;
                writeLocalUsers(users);
                alert("Votre compte local a été créé avec succès ! Connectez-vous dès maintenant.");
                this.toggleMode();
            }
        } catch (error) {
            alert(`Erreur d'authentification : ${error.message}`);
        }
    },

    async logout() {
        const ok = window.App && typeof window.App.showConfirm === 'function' ? await window.App.showConfirm("Voulez-vous vous déconnecter ?") : window.__orig_confirm ? window.__orig_confirm("Voulez-vous vous déconnecter ?") : false;
        if (ok) {
            localStorage.removeItem(localCurrentUserKey);
            window.location.reload();
        }
    }
};

window.Auth.init();
