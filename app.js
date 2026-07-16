// =========================================================================
// PARTIE 1 : CLASSES DE MODELISATION (Données)
// =========================================================================

// Guard: s'assurer qu'un objet `Auth` existe même sans système de connexion.
if (typeof window !== 'undefined' && !window.Auth) {
    window.Auth = {
        isLoginMode: false,
        currentUser: null,
        signupRole: 'organizer',
        init() { },
        toggleMode() { },
        submit() { window.App?.handleOrganizerRegistration?.(); },
        logout() { window.App?.showHome?.(); }
    };
}

class Player {
    constructor(name) {
        this.name = name;
        this.goals = 0;
        this.assists = 0;
        this.yellowCards = 0;
        this.redCards = 0;
        this.isSuspended = false; // Pour une future gestion avancée
    }
}


class Team {
    constructor(name, logoUrl = "") {
        this.name = name;
        // Si aucune URL n'est fournie, on génère un avatar DiceBear par défaut.
        this.logo = logoUrl || `https://api.dicebear.com/6.x/initials/svg?seed=${encodeURIComponent(name)}&backgroundColor=1d4ed8`;
        this.players = [];
        this.played = 0;
        this.won = 0;
        this.drawn = 0;
        this.lost = 0;
        this.goalsFor = 0;
        this.goalsAgainst = 0;
        this.points = 0;

        this.generateDefaultPlayers();
    }

    generateDefaultPlayers() {
        for (let i = 1; i <= 11; i++) {
            this.players.push(new Player(`Joueur ${i} (${this.name})`));
        }
    }
}


class Match {
    constructor(homeTeam, awayTeam) {
        this.home = homeTeam;
        this.away = awayTeam;
        this.scoreHome = null;
        this.scoreAway = null;
        this.played = false;
        this.events = [];
    }
}

// =========================================================================
// PARTIE 2 : MOTEUR DE L'APPLICATION (Navigation & Configuration)
// =========================================================================

window.App = {
    mode: null,
    teams: [],
    fixtures: [],
    groups: {},
    groupFixtures: {},
    bracket: {},
    tournamentPhase: 'groups',
    activeMatchData: null,
    tournamentName: '',
    tournamentLogo: '',
    tournamentConfirmed: false,
    tournamentType: null,
    userRole: null,
    userTeam: '',
    userProfile: null,
    tournaments: [],
    pendingJoinTournamentId: null,
    activeTournamentId: null,
    activeTournamentName: '',
    organizerProfile: null,
    invitations: [],
    organizerAuthMode: 'signup',
    firebaseEnabled: false,
    firebaseStore: null,
    firebaseAuth: null,
    firebaseUser: null,
    firebaseSyncTimer: null,
    firebaseSyncInFlight: false,
    firebaseTournamentListener: null,


    firebaseTournamentListenerUnsubscribe: null,
    lastFirebaseSyncAt: null,
    firebaseStatusMessage: 'Vérification Firebase…',

    init() {
        this.parseJoinQuery();
        this.loadFromLocalStorage();
        this.restoreOrganizerProfile();
        this.initFirebaseSync().catch(() => { });
        this.loadTournaments().then(async () => {
            if (this.pendingJoinTournamentId) {
                await this.handleJoinLink();
            } else {
                this.resolveManagerTournamentFromFirebase().catch(() => { });
                this.showInitialScreen();
            }
        });
    },

    isOrganizerUser() {
        return true;
    },

    toggleOrganizerAuthMode() {
        this.organizerAuthMode = this.organizerAuthMode === 'signup' ? 'signin' : 'signup';
        const title = document.getElementById('auth-title');
        const btn = document.getElementById('auth-submit-btn');
        const firstName = document.getElementById('organizer-first-name');
        const lastName = document.getElementById('organizer-last-name');
        const phone = document.getElementById('organizer-phone');
        const tournamentName = document.getElementById('organizer-tournament-name');
        const tournamentLogo = document.getElementById('organizer-tournament-logo');
        const locality = document.getElementById('organizer-tournament-locality');
        const type = document.getElementById('organizer-tournament-type');
        if (title) {
            title.textContent = this.organizerAuthMode === 'signup' ? '📝 Inscription organisateur' : '🔐 Connexion organisateur';
        }
        if (btn) {
            btn.textContent = this.organizerAuthMode === 'signup' ? 'Créer mon tournoi' : 'Se connecter';
        }
        const toggleFields = [firstName, lastName, phone, tournamentName, tournamentLogo, locality, type];
        toggleFields.forEach(el => {
            if (el) {
                el.style.display = this.organizerAuthMode === 'signup' ? '' : 'none';
            }
        });
    },

    showInitialScreen() {
        if (this.activeTournamentId) {
            this.goToActiveTournament();
            return;
        }

        const isOrganizer = this.userRole === 'organizer' || !!this.organizerProfile;
        if (isOrganizer) {
            this.showScreen('screen-mode');
            return;
        }

        this.showScreen('screen-dashb');
    },

    showScreen(screenId) {
        document.querySelectorAll('.screen').forEach(s => s.classList.add('hidden'));
        const screen = document.getElementById(screenId);
        if (!screen) return;
        screen.classList.remove('hidden');

        if (screenId === 'screen-mode') {
            this.populateTournamentFormFields(this.tournamentName, this.tournamentLogo);
            this.updateTournamentPreview();
            this.toggleInviteSection();
            this.renderJoinRequests();
            this.loadManagerAssignments();

            const modeInstruction = document.getElementById('mode-instruction');
            const modeCreateButton = document.getElementById('mode-create-tournament');
            if (modeInstruction) {
                if (!this.activeTournamentId) {
                    modeInstruction.textContent = 'Choisissez un format, puis créez un nouveau tournoi.';
                    modeInstruction.classList.remove('hidden');
                } else {
                    modeInstruction.classList.add('hidden');
                }
            }
            if (modeCreateButton) {
                modeCreateButton.classList.toggle('hidden', !!this.activeTournamentId);
            }
        }
        if (screenId === 'screen-setup') {
            this.updateSetupModeHint();
        }
        if (screenId === 'screen-dashb') {
            const dashbEmail = document.getElementById('user-display-email-dashb');
            if (dashbEmail) dashbEmail.textContent = `👤 ${this.organizerProfile ? `${this.organizerProfile.firstName} ${this.organizerProfile.lastName}` : 'organisateur'}`;
            this.loadTournaments();
        }
        if (screenId === 'screen-tournaments') {
            this.loadTournaments();
        }
        if (screenId === 'screen-manager') {
            const managerTitle = document.querySelector('#screen-manager h1');
            if (managerTitle) {
                const suffix = this.activeTournamentName ? ` - ${this.activeTournamentName}` : '';
                managerTitle.textContent = `👥 Gestion du tournoi${suffix}`;
            }
            this.renderManagerDashboard();
        }
        if (this.activeTournamentId) {
            this.attachTournamentRealtimeListener(this.activeTournamentId);
        }
        this.updateCurrentUserDisplay();
        this.updateHeaderActiveTab();
    },

    showHome() {
        this.showInitialScreen();
    },

    goToActiveTournament() {
        if (!this.activeTournamentId) return false;
        const tournament = this.tournaments.find(t => t.id === this.activeTournamentId);
        if (tournament) {
            this.activeTournamentName = tournament.name;
            this.tournamentName = tournament.name;
            this.tournamentLogo = tournament.logo || '';
            this.mode = tournament.type === 'championship' ? 'championship' : 'worldcup';
            this.tournamentType = this.mode;
        }
        if (this.userRole === 'manager' || this.userProfile?.role === 'manager') {
            this.showScreen('screen-manager');
        } else {
            this.showScreen('screen-mode');
        }
        return true;
    },

    toggleInviteSection() {
        const section = document.getElementById('invite-link-box');
        if (section) {
            section.classList.toggle('hidden', !this.activeTournamentId);
        }
        const linkInput = document.getElementById('invite-link-output');
        if (linkInput && this.activeTournamentId) {
            linkInput.value = this.buildInviteLink(this.activeTournamentId);
        }
        const message = document.getElementById('invite-message');
        if (message) {
            message.classList.add('hidden');
        }
    },

    buildInviteLink(tournamentId) {
        const base = window.location.origin + window.location.pathname;
        return `${base}?joinTournament=${encodeURIComponent(tournamentId)}`;
    },

    generateInviteLink() {
        const linkInput = document.getElementById('invite-link-output');
        const message = document.getElementById('invite-message-global');
        if (!this.activeTournamentId) {
            alert('Créez ou sélectionnez un tournoi avant de générer un lien.');
            return;
        }
        const link = this.buildInviteLink(this.activeTournamentId);
        if (linkInput) linkInput.value = link;
        if (message) {
            if (!this.firebaseEnabled) {
                message.textContent = '✅ Lien généré (mode local). Partagez-le manuellement sur vos réseaux.';
            } else {
                message.textContent = '✅ Lien d’invitation généré avec succès.';
            }
            message.classList.remove('hidden');
        }
    },

    copyInviteLink() {
        const input = document.getElementById('invite-link-output');
        if (!input || !input.value) return;
        navigator.clipboard.writeText(input.value).then(() => {
            const message = document.getElementById('invite-message');
            if (message) {
                message.textContent = '✅ Lien copié dans le presse-papiers.';
                message.classList.remove('hidden');
            }
        });
    },

    async handleJoinLink() {
        if (!this.pendingJoinTournamentId) return false;
        const tournament = this.tournaments.find(t => t.id === this.pendingJoinTournamentId);
        if (!tournament) {
            alert('Lien invalide ou tournoi introuvable.');
            this.showScreen('screen-dashb');
            return false;
        }

        if (this.userRole === 'manager' && this.activeTournamentId === tournament.id) {
            this.goToActiveTournament();
            return true;
        }

        this.activeTournamentId = tournament.id;
        this.activeTournamentName = tournament.name;
        this.tournamentName = tournament.name;
        this.tournamentLogo = tournament.logo || '';
        this.mode = tournament.type === 'championship' ? 'championship' : 'worldcup';
        this.tournamentType = this.mode;
        this.userRole = 'manager';

        const title = document.getElementById('manager-auth-title');
        const subtitle = document.getElementById('manager-auth-subtitle');
        if (title) title.textContent = `🔐 Rejoindre ${tournament.name}`;
        if (subtitle) subtitle.textContent = `Créez votre compte équipe pour rejoindre le tournoi ${tournament.name}.`;

        this.showScreen('screen-manager-auth');
        return true;
    },

    async handleManagerRegistration() {
        const fullName = document.getElementById('manager-full-name')?.value.trim();
        const teamName = document.getElementById('manager-team-name-signup')?.value.trim();
        const teamLogo = document.getElementById('manager-team-logo-signup')?.value.trim();
        const phone = document.getElementById('manager-phone')?.value.trim();
        const email = document.getElementById('manager-email')?.value.trim();
        const password = document.getElementById('manager-password')?.value || '';
        const message = document.getElementById('manager-auth-message');

        if (!fullName || !teamName || !email || !password || password.length < 6) {
            if (message) {
                message.textContent = 'Merci de remplir tous les champs et utiliser un mot de passe d’au moins 6 caractères.';
                message.classList.remove('hidden');
            }
            return;
        }

        if (!this.pendingJoinTournamentId) {
            alert('Aucun lien d’invitation actif.');
            return;
        }

        const tournament = this.tournaments.find(t => t.id === this.pendingJoinTournamentId);
        if (!tournament) {
            alert('Tournoi introuvable pour ce lien.');
            return;
        }

        if (!this.firebaseEnabled || !this.firebaseAuth) {
            alert('Firebase n’est pas disponible. Impossible de créer le compte équipe.');
            return;
        }

        try {
            const cred = await this.firebaseAuth.createUserWithEmailAndPassword(email, password);
            this.firebaseUser = cred.user;
            const uid = cred.user.uid;

            this.userRole = 'manager';
            this.userTeam = teamName;
            this.userProfile = {
                uid,
                fullName,
                email,
                phone,
                role: 'manager',
                teamName,
                teamLogo,
                activeTournamentId: tournament.id
            };

            this.activeTournamentId = tournament.id;
            this.activeTournamentName = tournament.name;
            this.tournamentName = tournament.name;
            this.tournamentLogo = tournament.logo || '';
            this.mode = tournament.type === 'championship' ? 'championship' : 'worldcup';
            this.tournamentType = this.mode;

            await this.syncManagerMembershipToFirebase(tournament.id, email, teamName);
            await this.syncManagerProfileToFirebase(email, tournament.id, {
                fullName,
                teamName,
                teamLogo,
                phone
            });

            localStorage.setItem('tfball-current-user', JSON.stringify({ uid, email }));
            this.saveToLocalStorage();
            this.showScreen('screen-manager');
            alert('Compte équipe créé avec succès. Vous êtes maintenant redirigé vers votre dashboard manager.');
        } catch (error) {
            const errorMessage = error?.message || 'Erreur lors de la création du compte équipe.';
            if (message) {
                message.textContent = errorMessage;
                message.classList.remove('hidden');
            } else {
                alert(errorMessage);
            }
        }
    },

    shareInviteLink() {
        const link = document.getElementById('invite-link-output')?.value;
        if (!link) return;
        if (navigator.share) {
            navigator.share({ title: 'Invitation au tournoi', text: 'Rejoignez le tournoi', url: link });
        } else {
            this.copyInviteLink();
        }
    },

    requestToFollowTournament(tournamentId) {
        const tournament = this.tournaments.find(t => t.id === tournamentId);
        if (!tournament) {
            alert('Tournoi introuvable.');
            return;
        }

        const requesterEmail = this.userProfile?.email || this.organizerProfile?.email || 'anonyme';
        const requests = Array.isArray(tournament.joinRequests) ? tournament.joinRequests : [];
        const alreadyPending = requests.some(req => req.status === 'en_attente' && req.requesterEmail?.toLowerCase() === requesterEmail.toLowerCase());

        if (alreadyPending) {
            alert('Une demande est déjà en attente pour ce tournoi.');
            return;
        }

        const request = {
            id: 'req_' + Date.now(),
            tournamentId,
            requesterEmail,
            requesterName: this.userProfile?.teamName || this.userProfile?.firstName || 'Manager',
            status: 'en_attente',
            createdAt: new Date().toISOString(),
            message: 'Demande d’adhésion au tournoi'
        };

        tournament.joinRequests = [request, ...requests];
        this.saveToLocalStorage();
        this.renderJoinRequests();
        this.renderTournamentsList();
        if (this.firebaseEnabled) {
            this.syncTournamentJoinRequestsToFirebase(tournamentId).catch(() => { });
        }
        alert('Votre demande d’adhésion a bien été envoyée au créateur du tournoi.');
    },

    renderJoinRequests() {
        const container = document.getElementById('join-requests-list');
        if (!container) return;

        const tournament = this.tournaments.find(t => t.id === this.activeTournamentId);
        const requests = Array.isArray(tournament?.joinRequests) ? tournament.joinRequests : [];

        const html = !requests.length
            ? '<p>Aucune demande d’adhésion pour le moment.</p>'
            : '<ul>' + requests.map(req => `
                <li>
                    <strong>${req.requesterName || 'Manager'}</strong><br>
                    <span>${req.requesterEmail || 'Email non renseigné'}</span><br>
                    <span>Statut : <strong>${req.status === 'en_attente' ? 'En attente' : req.status}</strong></span>
                    ${req.status === 'en_attente' ? `
                        <div class="join-request-actions">
                            <button class="btn-primary compact-btn" onclick="App.handleJoinRequest('${req.id}', 'accept')">Accepter</button>
                            <button class="btn-secondary compact-btn" onclick="App.handleJoinRequest('${req.id}', 'reject')">Refuser</button>
                        </div>
                    ` : ''}
                </li>
            `).join('') + '</ul>';

        container.innerHTML = html;
    },

    handleJoinRequest(requestId, action) {
        const tournament = this.tournaments.find(t => t.id === this.activeTournamentId);
        if (!tournament) return;

        const request = tournament.joinRequests?.find(req => req.id === requestId);
        if (!request) return;

        request.status = action === 'accept' ? 'acceptée' : 'refusée';
        request.respondedAt = new Date().toISOString();
        if (action === 'accept') {
            this.syncManagerMembershipToFirebase(this.activeTournamentId, request.requesterEmail, request.requesterName).catch(() => { });
            this.syncManagerProfileToFirebase(request.requesterEmail, this.activeTournamentId).catch(() => { });
        }
        this.saveToLocalStorage();
        this.renderJoinRequests();
        this.renderTournamentsList();
        if (this.firebaseEnabled) {
            this.syncTournamentJoinRequestsToFirebase(this.activeTournamentId).catch(() => { });
        }
    },

    goToTournamentSetup() {
        this.showScreen('screen-setup');
        this.updateLaunchButtonState();
        this.updateTournamentPreview();
        this.saveToLocalStorage();
    },

    redirectToTournamentManagementSpace() {
        const selectedType = this.tournamentType || this.mode || 'championship';
        this.mode = selectedType === 'championship' ? 'championship' : 'worldcup';
        this.tournamentType = this.mode;
        this.showScreen('screen-setup');
        this.updateLaunchButtonState();
        this.updateTournamentPreview();
        this.updateSetupModeHint();
        this.saveToLocalStorage();
    },

    updateSetupModeHint() {
        const hint = document.getElementById('setup-mode-hint');
        if (!hint) return;
        const label = this.mode === 'championship' ? 'Championnat' : 'Tournoi';
        hint.textContent = `Mode selectionné : ${label}. Ajoutez vos équipes pour démarrer la compétition.`;
    },

    updateFirebaseStatus(message, type = 'info') {
        this.firebaseStatusMessage = message;
        const statusEl = document.getElementById('firebase-status');
        const statusElGlobal = document.getElementById('firebase-status-global');
        // Update optional inline status element (detailed view)
        if (statusEl) {
            statusEl.textContent = message || '';
            statusEl.classList.toggle('inline-error', type === 'error');
            statusEl.classList.toggle('inline-success', type === 'success');
            statusEl.classList.toggle('subtitle', type !== 'error' && type !== 'success');
        }

        // Update global compact icon in the header
        if (statusElGlobal) {
            const safeMsg = (message || '').replace(/"/g, "&quot;");
            const titleAttr = safeMsg || 'Firebase';
            const color = type === 'success' ? '#10b981' : type === 'error' ? '#ef4444' : '#f59e0b';
            // inline shield SVG with a white check for a professional status icon
            statusElGlobal.innerHTML = `<svg class="firebase-status-svg" width="18" height="18" viewBox="0 0 24 24" aria-hidden="true" focusable="false" role="img" title="${titleAttr}">
                <path fill="${color}" d="M12 1L3 5v6c0 5.52 3.84 10.74 9 12 5.16-1.26 9-6.48 9-12V5l-9-4z"/>
                <path fill="#fff" d="M9.3 12.3l1.7 1.9 4.8-5.4 1.4 1.2-6.2 7-3-3.7 1.6-1.0z"/>
            </svg>`;
            if (message) {
                const textSpan = document.createElement('span');
                textSpan.className = 'firebase-status-text';
                textSpan.textContent = ' ' + message;
                statusElGlobal.appendChild(textSpan);
            }
        }
    },

    async initFirebaseSync() {
        if (window.location.protocol === 'file:') {
            console.info('Chargement local via file:// détecté : Firebase désactivé pour rester en mode hors ligne.');
            this.firebaseEnabled = false;
            this.firebaseStore = null;
            this.firebaseAuth = null;
            this.updateFirebaseStatus('', 'info');
            return false;
        }

        if (!window.firebase || !window.firebase.apps || typeof window.firebase.initializeApp !== 'function') {
            console.warn('Firebase SDK non chargé.');
            this.updateFirebaseStatus('Mode local actif', 'info');
            return false;
        }

        const config = window.TFBALL_FIREBASE_CONFIG || window.FIREBASE_CONFIG || null;
        if (!config || !config.projectId || String(config.projectId).includes('your-project')) {
            console.info('Firebase non configuré. L’application reste en mode local.');
            this.updateFirebaseStatus('Firebase non configuré. Vérifiez `TFBALL_FIREBASE_CONFIG` dans index.html.', 'error');
            return false;
        }

        try {
            if (!firebase.apps.length) {
                firebase.initializeApp(config);
            }
            this.firebaseStore = firebase.firestore();
            this.firebaseEnabled = true;

            if (firebase.auth && typeof firebase.auth === 'function') {
                this.firebaseAuth = firebase.auth();
                // Ne pas forcer l'authentification anonyme sur GitHub Pages ou lorsque le projet Firebase restreint cette opération.
            }

            await this.syncFromFirebase();
            console.info('Firebase prêt.');
            this.updateFirebaseStatus('Firebase prêt', 'success');
            return true;
        } catch (error) {
            console.warn('Firebase indisponible, fallback local activé.', error);
            this.firebaseEnabled = false;
            this.firebaseStore = null;
            this.firebaseAuth = null;
            this.updateFirebaseStatus('Firebase indisponible — vérifiez configuration et connexion réseau.', 'error');
            return false;
        }
    },

    scheduleFirebaseSync() {
        if (!this.firebaseEnabled || !this.firebaseStore) return;
        clearTimeout(this.firebaseSyncTimer);
        this.firebaseSyncTimer = setTimeout(() => {
            this.syncToFirebase().catch(() => { });
        }, 250);
    },

    getTournamentFirebaseDocId(tournamentId = this.activeTournamentId) {
        return `tournament_${tournamentId || 'default'}`;
    },

    attachTournamentRealtimeListener(tournamentId = this.activeTournamentId) {
        if (!this.firebaseEnabled || !this.firebaseStore || !tournamentId) return;

        if (this.firebaseTournamentListenerUnsubscribe) {
            this.firebaseTournamentListenerUnsubscribe();
            this.firebaseTournamentListenerUnsubscribe = null;
        }

        const docRef = this.firebaseStore.collection('tfball-tournaments').doc(this.getTournamentFirebaseDocId(tournamentId));
        this.firebaseTournamentListenerUnsubscribe = docRef.onSnapshot((snapshot) => {
            if (!snapshot.exists) return;
            const data = snapshot.data() || {};
            const incomingRequests = Array.isArray(data.joinRequests) ? data.joinRequests : [];
            const tournament = this.tournaments.find(t => t.id === tournamentId);
            if (!tournament) return;

            tournament.joinRequests = incomingRequests;
            this.renderJoinRequests();
            this.renderTournamentsList();
        }, (error) => {
            console.warn('Échec du listener Firebase pour les demandes.', error);
        });
    },

    async syncTournamentJoinRequestsToFirebase(tournamentId = this.activeTournamentId) {
        if (!this.firebaseEnabled || !this.firebaseStore || !tournamentId) return false;
        const tournament = this.tournaments.find(t => t.id === tournamentId);
        if (!tournament) return false;

        try {
            await this.firebaseStore.collection('tfball-tournaments').doc(this.getTournamentFirebaseDocId(tournamentId)).set({
                tournamentId: tournament.id,
                tournamentName: tournament.name || '',
                joinRequests: Array.isArray(tournament.joinRequests) ? tournament.joinRequests : [],
                organizerEmail: tournament.organizer?.email || null,
                managerEmails: Array.isArray(tournament.managerEmails) ? tournament.managerEmails : [],
                members: Array.isArray(tournament.members) ? tournament.members : [],
                updatedAt: new Date().toISOString()
            }, { merge: true });
            return true;
        } catch (error) {
            console.warn('Échec de synchronisation Firebase des demandes.', error);
            return false;
        }
    },

    async syncManagerMembershipToFirebase(tournamentId = this.activeTournamentId, managerEmail = this.userProfile?.email, managerName = this.userProfile?.teamName || this.userProfile?.firstName || 'Manager') {
        if (!this.firebaseEnabled || !this.firebaseStore || !tournamentId || !managerEmail) return false;
        const tournament = this.tournaments.find(t => t.id === tournamentId);
        if (!tournament) return false;

        const members = Array.isArray(tournament.members) ? tournament.members : [];
        const existing = members.find(member => member.email?.toLowerCase() === managerEmail.toLowerCase());
        const nextMember = {
            email: managerEmail,
            name: managerName,
            role: 'manager',
            status: 'active',
            joinedAt: existing?.joinedAt || new Date().toISOString()
        };

        const nextMembers = existing
            ? members.map(member => member.email?.toLowerCase() === managerEmail.toLowerCase() ? nextMember : member)
            : [...members, nextMember];

        const nextManagerEmails = Array.from(new Set([...(Array.isArray(tournament.managerEmails) ? tournament.managerEmails : []), managerEmail]));
        tournament.members = nextMembers;
        tournament.managerEmails = nextManagerEmails;

        try {
            await this.firebaseStore.collection('tfball-tournaments').doc(this.getTournamentFirebaseDocId(tournamentId)).set({
                tournamentId: tournament.id,
                tournamentName: tournament.name || '',
                members: nextMembers,
                managerEmails: nextManagerEmails,
                updatedAt: new Date().toISOString()
            }, { merge: true });
            return true;
        } catch (error) {
            console.warn('Échec de synchronisation Firebase des membres.', error);
            return false;
        }
    },

    async syncManagerProfileToFirebase(managerEmail = this.userProfile?.email, tournamentId = this.activeTournamentId, additionalData = {}) {
        if (!this.firebaseEnabled || !this.firebaseStore || !managerEmail) return false;
        try {
            const docId = `manager_${managerEmail.toLowerCase().replace(/[^a-z0-9]/g, '_')}`;
            await this.firebaseStore.collection('users').doc(docId).set({
                email: managerEmail,
                role: 'manager',
                activeTournamentId: tournamentId || null,
                updatedAt: new Date().toISOString(),
                ...additionalData
            }, { merge: true });
            return true;
        } catch (error) {
            console.warn('Échec de synchronisation Firebase du profil manager.', error);
            return false;
        }
    },

    async resolveManagerTournamentFromFirebase() {
        if (!this.firebaseEnabled || !this.firebaseStore) return false;
        const managerEmail = this.userProfile?.email || this.organizerProfile?.email || window.Auth?.currentUser?.email || null;
        if (!managerEmail) return false;

        try {
            const snapshot = await this.firebaseStore.collection('tfball-tournaments').where('managerEmails', 'array-contains', managerEmail).get();
            if (!snapshot || snapshot.empty) return false;

            const doc = snapshot.docs[0];
            const data = doc.data() || {};
            const tournament = this.tournaments.find(t => t.id === data.tournamentId) || this.tournaments.find(t => t.name === data.tournamentName);
            if (!tournament) return false;

            this.activeTournamentId = tournament.id;
            this.activeTournamentName = tournament.name;
            this.tournamentName = tournament.name;
            this.tournamentLogo = tournament.logo || '';
            this.mode = tournament.type === 'championship' ? 'championship' : 'worldcup';
            this.tournamentType = this.mode;
            this.userRole = 'manager';
            this.userProfile = this.userProfile || {};
            this.userProfile.role = 'manager';
            this.userProfile.email = managerEmail;
            this.userProfile.activeTournamentId = tournament.id;
            this.saveToLocalStorage();
            return true;
        } catch (error) {
            console.warn('Échec de restauration du tournoi manager Firebase.', error);
            return false;
        }
    },

    getFirebaseDocId() {
        if (this.firebaseUser?.uid) return `organizer_${this.firebaseUser.uid}`;
        if (this.organizerProfile?.email) return `organizer_${this.organizerProfile.email.toLowerCase().replace(/[^a-z0-9]/g, '_')}`;
        if (this.organizerProfile?.id) return `organizer_${this.organizerProfile.id}`;
        return 'tfball-default';
    },

    async syncToFirebase() {
        if (!this.firebaseEnabled || !this.firebaseStore || this.firebaseSyncInFlight) return false;
        const docId = this.getFirebaseDocId();
        const payload = window.TFBallFirebase?.buildStateSnapshot?.(this) || null;
        if (!payload) return false;

        this.firebaseSyncInFlight = true;
        try {
            await this.firebaseStore.collection('tfball-snapshots').doc(docId).set(payload, { merge: true });
            this.lastFirebaseSyncAt = payload.updatedAt;
            return true;
        } catch (error) {
            console.warn('Échec de synchronisation Firebase.', error);
            return false;
        } finally {
            this.firebaseSyncInFlight = false;
        }
    },

    async syncFromFirebase() {
        if (!this.firebaseEnabled || !this.firebaseStore) return false;
        const docId = this.getFirebaseDocId();
        try {
            const snapshot = await this.firebaseStore.collection('tfball-snapshots').doc(docId).get();
            if (!snapshot.exists) return false;
            const data = snapshot.data();
            if (window.TFBallFirebase?.mergeStateSnapshot?.(data, this)) {
                this.lastFirebaseSyncAt = data.updatedAt || new Date().toISOString();
                this.saveToLocalStorage();
                this.renderTournamentsList();
                this.toggleInviteSection();
                this.renderJoinRequests();
                return true;
            }
        } catch (error) {
            console.warn('Impossible de récupérer la donnée Firebase.', error);
        }
        return false;
    },

    async loadFromFirebase(userId, userEmail) {
        this.loadFromLocalStorage();
        this.restoreOrganizerProfile();
        this.showInitialScreen();
        await this.loadTournaments();
        return true;
    },

    updateCurrentUserDisplay() {
        const organizerName = this.organizerProfile ? `${this.organizerProfile.firstName} ${this.organizerProfile.lastName}` : null;
        const profileEmail = this.organizerProfile?.email || this.userProfile?.email;
        const display = organizerName || profileEmail;
        const text = display ? `👤 ${display}` : null;
        const adminEmail = document.getElementById('user-display-email-admin');
        const managerEmail = document.getElementById('user-display-email-manager');
        const globalEmail = document.getElementById('global-user-display-email');
        if (adminEmail && text !== null) adminEmail.textContent = text;
        if (managerEmail && text !== null) managerEmail.textContent = text;
        if (globalEmail && text !== null) globalEmail.textContent = text;
    },

    parseJoinQuery() {
        try {
            const params = new URLSearchParams(window.location.search);
            const joinId = params.get('joinTournament');
            if (joinId) this.pendingJoinTournamentId = joinId;
        } catch (e) { /* ignore */ }
    },

    acceptInvitationFromLink() {
        // Deprecated: kept as compatibility wrapper for older links.
        // New flow uses `handleJoinLink()` which shows the manager signup screen.
        return this.handleJoinLink ? this.handleJoinLink() : false;
    },

    async loadTournaments() {
        const listEl = document.getElementById('tournaments-list');
        const mgrList = document.getElementById('manager-tournaments-list');
        if (listEl) listEl.innerHTML = 'Chargement...';
        if (mgrList) mgrList.innerHTML = 'Chargement...';

        try {
            this.tournaments = await this.getTournamentsFromIndexedDB();
            if (!this.tournaments.length) {
                const stored = localStorage.getItem('football_manager_save');
                if (stored) {
                    const parsed = JSON.parse(stored);
                    this.tournaments = parsed.tournaments || [];
                }
            }
            this.renderTournamentsList();
            this.renderJoinRequests();
        } catch (error) {
            if (listEl) listEl.innerHTML = `<p class="inline-error">Erreur: ${error.message}</p>`;
            if (mgrList) mgrList.innerHTML = `<p class="inline-error">Erreur: ${error.message}</p>`;
        }
    },

    renderTournamentsList() {
        const listEl = document.getElementById('tournaments-list');
        const dashbList = document.getElementById('dashb-tournaments-list');
        const mainList = document.getElementById('tournaments-list-main');

        const formatTournamentType = (t) => {
            if (t?.type === 'championship') return 'Championnat';
            if (t?.type === 'group_knockout') return 'Phase de groupes + élimination directe';
            return 'Type non défini';
        };

        const htmlFor = (items) => {
            if (!items || items.length === 0) return '<p>Aucun tournoi trouvé pour le moment.</p>';
            return '<ul>' + items.map(t => `
                <li class="overview-card tournament-item">
                    <div class="tournament-item-meta overview-buttons" style="justify-content:flex-start; gap:12px;">
                        ${t.logo ? `<img src="${t.logo}" alt="Logo ${t.name}" style="width:48px;height:48px;object-fit:cover;border-radius:8px;">` : '<div style="width:48px;height:48px;border-radius:8px;background:#e2e8f0;display:flex;align-items:center;justify-content:center;">🏆</div>'}
                        <div>
                            <strong>${t.name || 'Tournoi sans nom'}</strong><br>
                            <span>${t.location || 'Localité non définie'}</span><br>
                            <span>Type : ${formatTournamentType(t)}</span>
                        </div>
                    </div>
                    <div class="tournament-item-action overview-buttons">
                        <button class="btn-primary compact-btn follow-btn" onclick="App.requestToFollowTournament('${t.id}')">Suivre</button>
                    </div>
                </li>
            `).join('') + '</ul>';
        };

        // apply optional filter
        const items = (this.tournamentsFilterType && this.tournamentsFilterType !== 'all')
            ? this.tournaments.filter(t => t.type === this.tournamentsFilterType)
            : this.tournaments;

        if (listEl) listEl.innerHTML = htmlFor(items);
        if (dashbList) dashbList.innerHTML = htmlFor(items);
        if (mainList) mainList.innerHTML = htmlFor(items);
    },

    filterTournamentsByType(type) {
        this.tournamentsFilterType = type || 'all';
        this.renderTournamentsList();
    },

    async handleOrganizerRegistration() {
        const email = document.getElementById('organizer-email')?.value?.trim();
        const password = document.getElementById('organizer-password')?.value || '';
        if (!email) {
            alert('Veuillez saisir votre adresse email.');
            return;
        }

        if (this.organizerAuthMode === 'signin') {
            if (!password) {
                alert('Veuillez saisir votre mot de passe.');
                return;
            }
            try {
                if (this.firebaseEnabled && this.firebaseAuth && typeof this.firebaseAuth.signInWithEmailAndPassword === 'function') {
                    const cred = await this.firebaseAuth.signInWithEmailAndPassword(email, password);
                    this.firebaseUser = cred.user;
                } else if (this.firebaseEnabled) {
                    console.warn('Firebase Auth n’est pas disponible dans cette configuration.');
                }
                const existing = this.tournaments.find(t => t.organizer?.email === email);
                if (!existing) {
                    alert('Aucun tournoi trouvé pour cet email. Veuillez créer un compte organisateur d’abord.');
                    return;
                }
                this.organizerProfile = existing.organizer;
                this.activeTournamentId = existing.id;
                this.activeTournamentName = existing.name;
                this.tournamentName = existing.name;
                this.tournamentLogo = existing.logo || '';
                this.userRole = 'organizer';
                this.userProfile = { ...existing.organizer, email, role: 'organizer' };
                this.userTeam = '';
                this.mode = existing.type === 'championship' ? 'championship' : 'worldcup';
                this.tournamentType = this.mode;
                this.saveToLocalStorage();
                this.showScreen('screen-mode');
                this.updateTournamentPreview();
                this.loadTournaments();
                alert('Connexion réussie.');
            } catch (error) {
                alert('Erreur lors de la connexion : ' + error.message);
            }
            return;
        }

        const firstName = document.getElementById('organizer-first-name')?.value?.trim();
        const lastName = document.getElementById('organizer-last-name')?.value?.trim();
        const phone = document.getElementById('organizer-phone')?.value?.trim();
        const tournamentName = document.getElementById('organizer-tournament-name')?.value?.trim();
        const tournamentLogo = document.getElementById('organizer-tournament-logo')?.value?.trim();
        const locality = document.getElementById('organizer-tournament-locality')?.value?.trim();
        const tournamentType = document.getElementById('organizer-tournament-type')?.value || 'championship';

        if (!firstName || !lastName || !phone || !tournamentName || !password) {
            alert('Veuillez remplir tous les champs obligatoires pour créer votre tournoi.');
            return;
        }

        const profile = {
            id: 'org_' + Date.now(),
            firstName,
            lastName,
            email,
            phone,
            createdAt: new Date().toISOString()
        };

        const tournament = {
            id: 't_' + Date.now(),
            name: tournamentName,
            logo: tournamentLogo || '',
            location: locality || 'Non précisée',
            type: tournamentType === 'championship' ? 'championship' : 'group_knockout',
            createdBy: profile.id,
            organizer: profile,
            joinRequests: [],
            createdAt: new Date().toISOString()
        };

        try {
            if (this.firebaseEnabled && this.firebaseAuth && typeof this.firebaseAuth.createUserWithEmailAndPassword === 'function') {
                const cred = await this.firebaseAuth.createUserWithEmailAndPassword(email, password);
                this.firebaseUser = cred.user;
            } else if (this.firebaseEnabled) {
                console.warn('Firebase Auth n’est pas disponible dans cette configuration.');
            }
            this.resetCurrentTournamentState();
            this.organizerProfile = profile;
            this.tournaments = [tournament, ...(this.tournaments || [])];
            this.activeTournamentId = tournament.id;
            this.activeTournamentName = tournament.name;
            this.tournamentName = tournament.name;
            this.tournamentLogo = tournament.logo;
            this.tournamentConfirmed = false;
            this.mode = tournament.type === 'championship' ? 'championship' : 'worldcup';
            this.tournamentType = this.mode;
            this.userRole = 'organizer';
            this.userProfile = { ...profile, email, role: 'organizer' };
            this.userTeam = '';
            this.populateTournamentFormFields(this.tournamentName, this.tournamentLogo);
            await this.persistOrganizerAndTournament(profile, tournament);
            this.saveToLocalStorage();
            this.showScreen('screen-mode');
            this.updateTournamentPreview();
            this.loadTournaments();
            alert('Tournoi créé avec succès. Vous êtes maintenant dans la gestion de votre tournoi.');
        } catch (error) {
            alert('Erreur lors de la création du tournoi : ' + error.message);
        }
    },

    createTournamentPrompt() {
        this.showScreen('screen-auth');
    },

    async joinTournament(tournamentId) {
        this.openTournament(tournamentId);
    },

    openTournament(tournamentId) {
        const tournament = this.tournaments.find(t => t.id === tournamentId);
        if (!tournament) return;
        this.activeTournamentId = tournament.id;
        this.activeTournamentName = tournament.name;
        this.tournamentName = tournament.name;
        this.tournamentLogo = tournament.logo || '';
        this.mode = tournament.type === 'championship' ? 'championship' : 'worldcup';
        this.tournamentType = this.mode;
        this.userRole = 'manager';
        this.userProfile = this.userProfile || {};
        this.userProfile.role = 'manager';
        this.saveToLocalStorage();
        this.showScreen('screen-manager');
    },

    openTournamentAdmin(id) {
        alert('Ouvrir administration du tournoi ' + id + ' (à implémenter)');
    },

    async leaveCurrentTournament() {
        if (!this.activeTournamentId) {
            alert('Aucun tournoi actif à quitter.');
            return;
        }

        const confirmed = confirm('Voulez-vous vraiment quitter ce tournoi ? Vous pourrez ensuite rejoindre un autre tournoi.');
        if (!confirmed) return;

        const tournament = this.tournaments.find(t => t.id === this.activeTournamentId);
        if (tournament) {
            tournament.members = (Array.isArray(tournament.members) ? tournament.members : []).filter(member => member.email?.toLowerCase() !== (this.userProfile?.email || '').toLowerCase());
            tournament.managerEmails = (Array.isArray(tournament.managerEmails) ? tournament.managerEmails : []).filter(email => email?.toLowerCase() !== (this.userProfile?.email || '').toLowerCase());
            tournament.joinRequests = (Array.isArray(tournament.joinRequests) ? tournament.joinRequests : []).filter(req => req.requesterEmail?.toLowerCase() !== (this.userProfile?.email || '').toLowerCase());
        }

        this.userRole = 'manager';
        this.userProfile = this.userProfile || {};
        this.userProfile.role = 'manager';
        this.userProfile.activeTournamentId = null;
        this.userTeam = '';
        this.activeTournamentId = null;
        this.activeTournamentName = '';
        this.tournamentName = '';
        this.tournamentLogo = '';
        this.mode = null;
        this.tournamentType = null;
        this.saveToLocalStorage();

        if (this.firebaseEnabled && this.userProfile?.email) {
            this.syncManagerProfileToFirebase(this.userProfile.email, null).catch(() => { });
            if (tournament) {
                this.syncTournamentJoinRequestsToFirebase(tournament.id).catch(() => { });
            }
        }

        this.showScreen('screen-dashb');
        alert('Vous avez quitté le tournoi.');
    },

    renderManagerDashboard() {
        const profileStatus = document.getElementById('manager-profile-status');
        const teamNameDisplay = document.getElementById('manager-team-name-display');
        const teamNameInput = document.getElementById('manager-team-name');
        const teamLogoInput = document.getElementById('manager-team-logo');
        const roleDisplay = document.getElementById('manager-role-display');
        const teamStatsContainer = document.getElementById('manager-team-stats');
        const matchesList = document.getElementById('manager-matches-list');

        const displayTeamName = this.userTeam || 'Aucune équipe assignée';
        teamNameDisplay.textContent = displayTeamName;
        roleDisplay.textContent = `Rôle : ${this.userRole === 'admin' ? 'Administrateur' : "Manager d'équipe"}`;
        profileStatus.textContent = this.userTeam ? 'Votre compte est lié à cette équipe.' : 'Votre compte n’est pas encore associé à une équipe.';

        if (teamNameInput) teamNameInput.value = this.userTeam;
        if (teamLogoInput) teamLogoInput.value = this.userProfile?.teamLogo || '';

        const team = this.teams.find(t => t.name.toLowerCase() === this.userTeam.toLowerCase());
        if (team) {
            teamStatsContainer.innerHTML = `
                <p><strong>${team.name}</strong></p>
                <ul class="overview-list">
                    <li>Matchs joués : ${team.played}</li>
                    <li>Victoires : ${team.won}</li>
                    <li>Nuls : ${team.drawn}</li>
                    <li>Défaites : ${team.lost}</li>
                    <li>But(s) pour : ${team.goalsFor}</li>
                    <li>But(s) contre : ${team.goalsAgainst}</li>
                    <li>Points : ${team.points}</li>
                </ul>
            `;
        } else {
            teamStatsContainer.innerHTML = `<p>Aucune donnée de tournoi disponible pour votre équipe.</p><p>Contactez l'administrateur pour vérifier l'affectation ou charger le tournoi.</p>`;
        }

        const matches = this.getTeamRelatedMatches(this.userTeam);
        if (matches.length > 0) {
            matchesList.innerHTML = matches.slice(0, 5).map(match => {
                const opponent = match.home.name.toLowerCase() === this.userTeam.toLowerCase() ? match.away.name : match.home.name;
                const score = match.played ? `${match.scoreHome} - ${match.scoreAway}` : 'À jouer';
                return `<div class="match-card compact-card"><strong>${match.home.name}</strong> vs <strong>${match.away.name}</strong><span>${score}</span></div>`;
            }).join('');
        } else {
            matchesList.innerHTML = `<p>Aucun match trouvé pour votre équipe.</p>`;
        }
    },

    getTeamRelatedMatches(teamName) {
        if (!teamName) return [];
        const matches = [];
        const lowerName = teamName.toLowerCase();

        if (this.mode === 'championship') {
            this.fixtures.flat().forEach(match => {
                if (match.home.name.toLowerCase() === lowerName || match.away.name.toLowerCase() === lowerName) {
                    matches.push(match);
                }
            });
        } else {
            Object.values(this.groupFixtures).flat().forEach(match => {
                if (match.home.name.toLowerCase() === lowerName || match.away.name.toLowerCase() === lowerName) {
                    matches.push(match);
                }
            });
            if (this.bracket.demis) this.bracket.demis.concat(this.bracket.finale || []).forEach(match => {
                if (match.home.name.toLowerCase() === lowerName || match.away.name.toLowerCase() === lowerName) {
                    matches.push(match);
                }
            });
        }
        return matches;
    },

    async leaveTournament() {
        if (!this.activeTournamentId) {
            alert('Aucun tournoi actif à quitter.');
            return;
        }

        const confirmed = confirm('Voulez-vous vraiment quitter ce tournoi ? Vous pourrez vous réintégrer plus tard avec une autre équipe.');
        if (!confirmed) return;

        const managerEmail = this.userProfile?.email || this.organizerProfile?.email || window.Auth?.currentUser?.email || null;
        const tournament = this.tournaments.find(t => t.id === this.activeTournamentId);
        if (tournament) {
            tournament.members = (Array.isArray(tournament.members) ? tournament.members : []).filter(member => member.email?.toLowerCase() !== managerEmail?.toLowerCase());
            tournament.managerEmails = (Array.isArray(tournament.managerEmails) ? tournament.managerEmails : []).filter(email => email?.toLowerCase() !== managerEmail?.toLowerCase());
            tournament.joinRequests = (Array.isArray(tournament.joinRequests) ? tournament.joinRequests : []).filter(req => req.requesterEmail?.toLowerCase() !== managerEmail?.toLowerCase());
        }

        this.userRole = 'manager';
        this.userProfile = this.userProfile || {};
        this.userProfile.role = 'manager';
        this.userProfile.activeTournamentId = null;
        this.userTeam = '';
        this.activeTournamentId = null;
        this.activeTournamentName = '';
        this.tournamentName = '';
        this.tournamentLogo = '';
        this.mode = null;
        this.tournamentType = null;
        this.saveToLocalStorage();

        if (this.firebaseEnabled && managerEmail) {
            this.syncTournamentJoinRequestsToFirebase(this.activeTournamentId || tournament?.id).catch(() => { });
            this.syncManagerProfileToFirebase(managerEmail, null).catch(() => { });
        }

        this.renderManagerDashboard();
        this.showScreen('screen-dashb');
        alert('Vous avez quitté le tournoi. Vous pouvez vous réintégrer à tout moment.');
    },

    async saveManagerProfile() {
        const teamNameInput = document.getElementById('manager-team-name');
        const teamLogoInput = document.getElementById('manager-team-logo');
        const message = document.getElementById('manager-profile-message');

        const teamName = teamNameInput ? teamNameInput.value.trim() : '';
        const teamLogo = teamLogoInput ? teamLogoInput.value.trim() : '';

        if (!teamName) {
            message.textContent = 'Le nom de votre équipe est requis.';
            message.classList.remove('hidden');
            return;
        }

        this.userTeam = teamName;
        if (!this.userProfile) this.userProfile = {};
        this.userProfile.teamName = teamName;
        this.userProfile.teamLogo = teamLogo;

        const userId = window.Auth?.currentUser?.uid || this.userProfile?.uid;
        if (window.fbDb && window.fbDoc && window.fbSetDoc && userId) {
            await window.fbSetDoc(window.fbDoc(window.fbDb, 'users', userId), {
                teamName,
                teamLogo,
                email: this.userProfile?.email,
                role: this.userRole || 'manager'
            }, { merge: true });
        }

        const team = this.teams.find(t => t.name.toLowerCase() === this.userTeam.toLowerCase());
        if (team) {
            team.name = teamName;
            if (teamLogo) team.logo = teamLogo;
            this.saveToLocalStorage();
        }

        message.textContent = 'Votre profil manager d’équipe a bien été enregistré.';
        message.classList.remove('hidden');
        this.renderManagerDashboard();
    },

    async assignManagerToTeam() {
        const emailInput = document.getElementById('admin-manager-email');
        const teamInput = document.getElementById('admin-team-name');
        const message = document.getElementById('admin-assign-message');
        const email = emailInput ? emailInput.value.trim() : '';
        const teamName = teamInput ? teamInput.value.trim() : '';

        if (!email || !teamName) {
            message.textContent = 'Veuillez indiquer l’email du manager et le nom de l’équipe.';
            message.classList.remove('hidden');
            return;
        }

        const team = this.teams.find(t => t.name.toLowerCase() === teamName.toLowerCase());
        if (!team) {
            message.textContent = 'Cette équipe n’existe pas encore dans le tournoi.';
            message.classList.remove('hidden');
            return;
        }

        try {
            if (!window.fbDb || !window.fbCollection || !window.fbQuery || !window.fbWhere || !window.fbGetDocs || !window.fbDoc || !window.fbSetDoc) {
                throw new Error('Firestore non initialisé.');
            }

            const usersRef = window.fbCollection(window.fbDb, 'users');
            const teamQuery = window.fbQuery(usersRef, window.fbWhere('teamName', '==', teamName));
            const teamSnapshot = await window.fbGetDocs(teamQuery);
            if (!teamSnapshot.empty) {
                const otherManager = teamSnapshot.docs.find(docSnap => docSnap.data().email?.toLowerCase() !== email.toLowerCase());
                if (otherManager) {
                    message.textContent = `Cette équipe est déjà assignée à ${otherManager.data().email}.`;
                    message.classList.remove('hidden');
                    return;
                }
            }

            const q = window.fbQuery(usersRef, window.fbWhere('email', '==', email));
            const userSnapshot = await window.fbGetDocs(q);
            if (userSnapshot.empty) {
                message.textContent = 'Aucun manager trouvé avec cette adresse email.';
                message.classList.remove('hidden');
                return;
            }

            for (const docSnap of userSnapshot.docs) {
                await window.fbSetDoc(window.fbDoc(window.fbDb, 'users', docSnap.id), {
                    teamName,
                    role: 'manager'
                }, { merge: true });
            }

            message.textContent = `Manager ${email} affecté à l'équipe ${teamName}.`;
            message.classList.remove('hidden');
            this.loadManagerAssignments();
        } catch (error) {
            message.textContent = `Erreur lors de l'affectation : ${error.message}`;
            message.classList.remove('hidden');
        }
    },

    async loadManagerAssignments() {
        const listContainer = document.getElementById('admin-manager-list');
        if (!listContainer) return;
        listContainer.innerHTML = 'Chargement...';

        if (!window.fbDb || !window.fbCollection || !window.fbQuery || !window.fbWhere || !window.fbGetDocs) {
            listContainer.innerHTML = '<p class="inline-error">Firestore non initialisé.</p>';
            return;
        }

        try {
            const usersRef = window.fbCollection(window.fbDb, 'users');
            const q = window.fbQuery(usersRef, window.fbWhere('role', '==', 'manager'));
            const querySnapshot = await window.fbGetDocs(q);

            if (querySnapshot.empty) {
                listContainer.innerHTML = '<p>Aucun manager enregistré.</p>';
                return;
            }

            listContainer.innerHTML = '<ul>' + querySnapshot.docs.map(docSnap => {
                const data = docSnap.data();
                return `<li><strong>${data.email || 'Sans email'}</strong> → ${data.teamName || 'Aucune équipe assignée'}</li>`;
            }).join('') + '</ul>';
        } catch (error) {
            listContainer.innerHTML = `<p class="inline-error">Erreur de chargement : ${error.message}</p>`;
        }
    },

    selectMode(chosenMode) {
        const modeError = document.getElementById('mode-error');
        if (this.teams.length > 0 && this.mode && this.mode !== chosenMode) {
            modeError.textContent = "Impossible de changer de format après avoir ajouté des équipes. Réinitialisez le tournoi pour recommencer.";
            modeError.classList.remove('hidden');
            return;
        }

        if (modeError) {
            modeError.classList.add('hidden');
        }
        this.mode = chosenMode;
        document.getElementById('setup-title').textContent =
            chosenMode === 'championship' ? "Configuration du Championnat" : "Configuration du Tournoi";
        this.goToTournamentSetup();
    },

    addTeam() {
        const nameInput = document.getElementById('team-name-input');
        const logoInput = document.getElementById('team-logo-input');
        const errorBox = document.getElementById('team-error');
        const name = nameInput.value.trim();
        const logo = logoInput.value.trim();

        const validation = this.validateTeamInput(name, logo);
        if (!validation.valid) {
            errorBox.textContent = validation.message;
            errorBox.classList.remove('hidden');
            return;
        }

        errorBox.classList.add('hidden');
        this.teams.push(new Team(name, logo));
        nameInput.value = '';
        logoInput.value = '';
        this.renderSetupTeams();
        this.updateTournamentPreview();
        this.saveToLocalStorage();
    },

    validateTeamInput(name, logo) {
        if (!name) {
            return { valid: false, message: "Le nom de l'équipe est requis." };
        }
        if (name.length < 2) {
            return { valid: false, message: "Le nom de l'équipe doit contenir au moins 2 caractères." };
        }
        if (this.teams.some(t => t.name.toLowerCase() === name.toLowerCase())) {
            return { valid: false, message: "Cette équipe existe déjà dans la liste." };
        }
        if (logo) {
            const urlPattern = /^(https?:\/\/)[\w\-]+(\.[\w\-]+)+([\w\-.,@?^=%&:/~+#])*[\w\-@?^=%&;/~+#]$/i;
            if (!urlPattern.test(logo)) {
                return { valid: false, message: "L'URL du logo doit être valide et commencer par http:// ou https://." };
            }
        }
        return { valid: true };
    },

    renderSetupTeams() {
        const list = document.getElementById('teams-list');
        list.innerHTML = this.teams.map(t => `
            <li class="setup-team-item">
                <img src="${t.logo}" class="team-logo-small" alt="logo">
                <span>${t.name}</span>
            </li>
        `).join('');
        this.updateLaunchButtonState();
    },

    updateLaunchButtonState() {
        const launchButton = document.getElementById('btn-launch');
        const status = document.getElementById('launch-status');
        const validation = this.validateLaunch();

        launchButton.disabled = !validation.valid;
        if (validation.valid) {
            status.textContent = "✅ Prêt ! Vous pouvez lancer la compétition.";
            status.classList.add('ready');
            status.classList.remove('warning');
        } else {
            status.textContent = `⚠️ ${validation.message}`;
            status.classList.add('warning');
            status.classList.remove('ready');
        }

        const modeError = document.getElementById('mode-error');
        if (modeError && !modeError.classList.contains('hidden')) {
            modeError.classList.add('hidden');
        }
    },


    switchTab(tabId, event) {
        document.querySelectorAll('.tab-link').forEach(btn => btn.classList.remove('active'));
        document.querySelectorAll('.tab-content').forEach(content => content.classList.add('hidden'));

        if (event && event.target) {
            event.target.classList.add('active');
        }
        document.getElementById(`tab-${tabId}`).classList.remove('hidden');

        if (tabId === 'overview') this.renderOverviewTab();
        if (tabId === 'stats') this.renderPlayerStats();
        if (tabId === 'media') this.generateMediaArticles();
    },

    renderOverviewTab() {
        const container = document.getElementById('tab-overview');
        const teamsCount = this.teams.length;
        const modeLabel = this.mode === 'championship' ? 'Championnat' : this.mode === 'worldcup' ? 'Tournoi' : 'Non défini';
        const phaseLabel = this.mode === 'worldcup'
            ? (this.tournamentPhase === 'knockout' ? 'Phase finale' : 'Phase de groupes')
            : 'Aller-retour';
        const nextAction = this.getOverviewAction();
        const teamItems = this.teams.map(t => `<li>${t.name}</li>`).join('') || '<li>Aucune équipe ajoutée</li>';

        container.innerHTML = `
            <div class="overview-grid">
                <div class="overview-card overview-highlight">
                    <h3>Statut du tournoi</h3>
                    <p><strong>${this.tournamentName || 'Nom non défini'}</strong></p>
                    <p>${this.tournamentConfirmed ? '✅ Confirmé' : '⚠️ Non confirmé'}</p>
                </div>
                <div class="overview-card">
                    <h3>Format choisi</h3>
                    <p>${modeLabel}</p>
                    <p>Phase : ${phaseLabel}</p>
                </div>
                <div class="overview-card">
                    <h3>Équipes inscrites</h3>
                    <p>${teamsCount} équipe(s)</p>
                    <ul class="overview-list">${teamItems}</ul>
                </div>
                <div class="overview-card overview-action-card">
                    <h3>Prochaine étape</h3>
                    <p>${nextAction}</p>
                    <div class="overview-buttons">
                        <button class="btn-secondary" onclick="App.switchTab('matches', event)">Aller aux matchs</button>
                        <button class="btn-secondary" onclick="App.switchTab('standings', event)">Voir le classement</button>
                    </div>
                </div>
            </div>
            <div class="overview-notes">
                <h3>Conseils de projet</h3>
                <ul>
                    <li>Utilisez ce résumé pour suivre l'état de création du tournoi.</li>
                    <li>Le format championnat se joue en aller-retour.</li>
                    <li>Le format tournoi génère des poules, puis une phase finale.</li>
                    <li>Confirmez le nom et le logo avant de lancer pour activer le tournoi.</li>
                </ul>
            </div>
        `;
    },

    getOverviewAction() {
        if (!this.mode) {
            return 'Choisissez un format de compétition pour commencer.';
        }
        if (!this.tournamentConfirmed) {
            return 'Confirmez les informations du tournoi avant de lancer.';
        }
        if (this.teams.length < 4) {
            return 'Ajoutez au moins 4 équipes pour pouvoir démarrer la compétition.';
        }
        if (this.mode === 'worldcup' && this.tournamentPhase === 'groups') {
            return 'Complétez les matchs de poule puis générez la phase finale.';
        }
        if (this.mode === 'worldcup' && this.tournamentPhase === 'knockout') {
            return 'Saisissez les scores de l’arbre pour déterminer le champion.';
        }
        return 'Le tournoi est prêt. Naviguez vers les matchs ou le classement.';
    },

    launchCompetition() {
        this.updateTournamentPreview();
        const errorBox = document.getElementById('team-error');
        const validation = this.validateLaunch();

        if (!validation.valid) {
            errorBox.textContent = validation.message;
            errorBox.classList.remove('hidden');
            return;
        }

        errorBox.classList.add('hidden');
        this.activeTournamentName = this.tournamentName || this.activeTournamentName || 'Tournoi';
        this.saveToLocalStorage();
        this.showScreen('screen-dashboard');
        this.applyTournamentInfoOnDashboard();
        if (this.mode === 'championship') {
            this.generateChampionship();
        } else if (this.mode === 'worldcup') {
            this.generateWorldCup();
        }
    },

    validateLaunch() {
        if (this.teams.length < 4) {
            return { valid: false, message: "Ajoutez au moins 4 équipes pour démarrer le tournoi." };
        }
        if (!this.mode) {
            return { valid: false, message: "Sélectionnez un format de compétition avant de lancer." };
        }
        if (!this.tournamentConfirmed) {
            return { valid: false, message: "Confirmez les informations du tournoi avant de lancer." };
        }
        return { valid: true };
    },

    updateTournamentPreview() {
        const nameInput = document.getElementById('tournament-name-input');
        const logoInput = document.getElementById('tournament-logo-input');
        const previewName = document.getElementById('tournament-preview-name');
        const previewSubtitle = document.getElementById('tournament-preview-subtitle');
        const previewLogo = document.getElementById('tournament-logo-preview');
        const confirmation = document.getElementById('tournament-confirmation');

        const currentName = nameInput ? nameInput.value.trim() : '';
        const currentLogo = logoInput ? logoInput.value.trim() : '';
        const previewNameValue = currentName || this.tournamentName;
        const previewLogoValue = currentLogo || this.tournamentLogo;

        const matchesSavedInfo = currentName === this.tournamentName && currentLogo === this.tournamentLogo;
        if (this.tournamentConfirmed && !matchesSavedInfo) {
            this.tournamentConfirmed = false;
            if (confirmation) confirmation.classList.add('hidden');
        }

        const confirmButton = document.getElementById('btn-confirm-tournament');
        if (this.tournamentConfirmed && matchesSavedInfo && confirmation) {
            confirmation.classList.remove('hidden');
            if (confirmButton) confirmButton.disabled = true;
        } else if (confirmation && !this.tournamentConfirmed) {
            confirmation.classList.add('hidden');
            if (confirmButton) confirmButton.disabled = false;
        }

        previewName.textContent = previewNameValue || 'Nom du tournoi non défini';
        previewSubtitle.textContent = previewNameValue ? "Votre compétition est prête à être personnalisée." : "Entrez un nom et un logo pour personnaliser votre compétition.";

        if (previewLogoValue) {
            previewLogo.src = previewLogoValue;
            previewLogo.classList.remove('hidden');
        } else {
            previewLogo.src = '';
            previewLogo.classList.add('hidden');
        }
    },

    applyTournamentInfoOnDashboard() {
        const bannerName = document.getElementById('view-tournament-name');
        const bannerLogo = document.getElementById('view-tournament-logo');

        bannerName.textContent = this.tournamentName || 'Mon Tournoi';
        if (this.tournamentLogo) {
            bannerLogo.src = this.tournamentLogo;
            bannerLogo.classList.remove('hidden');
        } else {
            bannerLogo.src = '';
            bannerLogo.classList.add('hidden');
        }
    },

    confirmTournamentInfo() {
        const nameInput = document.getElementById('tournament-name-input');
        const logoInput = document.getElementById('tournament-logo-input');
        const errorBox = document.getElementById('tournament-error');
        const confirmation = document.getElementById('tournament-confirmation');

        const name = nameInput ? nameInput.value.trim() : '';
        const logo = logoInput ? logoInput.value.trim() : '';
        const validation = this.validateTournamentInfo(name, logo);

        if (!validation.valid) {
            errorBox.textContent = validation.message;
            errorBox.classList.remove('hidden');
            if (confirmation) confirmation.classList.add('hidden');
            this.tournamentConfirmed = false;
            this.updateLaunchButtonState();
            return;
        }

        errorBox.classList.add('hidden');
        if (confirmation) {
            confirmation.textContent = "✅ Informations du tournoi confirmées.";
            confirmation.classList.remove('hidden');
        }

        this.tournamentName = name;
        this.tournamentLogo = logo;
        this.tournamentConfirmed = true;
        this.updateTournamentPreview();
        this.updateLaunchButtonState();
        this.saveToLocalStorage();
        this.redirectToTournamentManagementSpace();

        const confirmButton = document.getElementById('btn-confirm-tournament');
        if (confirmButton) confirmButton.disabled = true;
    },

    populateTournamentFormFields(name = '', logo = '') {
        const nameInput = document.getElementById('tournament-name-input');
        const logoInput = document.getElementById('tournament-logo-input');
        if (nameInput) nameInput.value = name || this.tournamentName || '';
        if (logoInput) logoInput.value = logo || this.tournamentLogo || '';
    },

    validateTournamentInfo(name, logo) {
        if (!name) {
            return { valid: false, message: "Le nom du tournoi est requis pour confirmer." };
        }
        if (name.length < 3) {
            return { valid: false, message: "Le nom du tournoi doit contenir au moins 3 caractères." };
        }
        if (logo) {
            const urlPattern = /^(https?:\/\/)[\w\-]+(\.[\w\-]+)+([\w\-.,@?^=%&:/~+#])*[\w\-@?^=%&;/~+#]$/i;
            if (!urlPattern.test(logo)) {
                return { valid: false, message: "L'URL du logo doit être valide et commencer par http:// ou https://." };
            }
        }
        return { valid: true };
    },

    // =========================================================================
    // PARTIE 3 : LOGIQUE DU MODE CHAMPIONNAT
    // =========================================================================

    generateChampionship() {
        let pool = [...this.teams];
        if (pool.length % 2 !== 0) {
            pool.push(new Team("Exempt"));
        }

        const numTeams = pool.length;
        const totalRounds = numTeams - 1;
        const matchesPerRound = numTeams / 2;
        let allerFixtures = [];

        for (let round = 0; round < totalRounds; round++) {
            let roundMatches = [];
            for (let i = 0; i < matchesPerRound; i++) {
                const home = pool[i];
                const away = pool[numTeams - 1 - i];
                if (home.name !== "Exempt" && away.name !== "Exempt") {
                    roundMatches.push(new Match(home, away));
                }
            }
            allerFixtures.push(roundMatches);
            pool.splice(1, 0, pool.pop());
        }

        let retourFixtures = allerFixtures.map(round => {
            return round.map(match => new Match(match.away, match.home));
        });

        this.fixtures = [...allerFixtures, ...retourFixtures];
        this.renderMatchesTab();
        this.renderStandingsTab();
    },

    renderMatchesTab() {
        const container = document.getElementById('tab-matches');
        container.innerHTML = "";

        this.fixtures.forEach((round, roundIdx) => {
            const roundDiv = document.createElement('div');
            roundDiv.className = 'round-box';
            roundDiv.innerHTML = `<h3>Journée ${roundIdx + 1}</h3>`;

            const listDiv = document.createElement('div');
            listDiv.className = 'matches-list';

            round.forEach((match, matchIdx) => {
                const matchCard = document.createElement('div');
                matchCard.className = 'match-card';
                matchCard.innerHTML = `
                    <span class="team-name text-right">${match.home.name}</span>
                    <button class="btn-score-trigger" onclick="App.openMatchModal('championship', ${roundIdx}, ${matchIdx})">
                        ${match.played ? `${match.scoreHome} : ${match.scoreAway}` : 'Saisir Score'}
                    </button>
                    <span class="team-name text-left">${match.away.name}</span>
                `;
                listDiv.appendChild(matchCard);
            });

            roundDiv.appendChild(listDiv);
            container.appendChild(roundDiv);
        });
    },

    computeStandings() {
        this.teams.forEach(t => {
            t.played = 0; t.won = 0; t.drawn = 0; t.lost = 0;
            t.goalsFor = 0; t.goalsAgainst = 0; t.points = 0;
        });

        this.fixtures.flat().forEach(match => {
            if (!match.played) return;
            const h = match.home; const a = match.away;
            h.played++; a.played++;
            h.goalsFor += match.scoreHome; h.goalsAgainst += match.scoreAway;
            a.goalsFor += match.scoreAway; a.goalsAgainst += match.scoreHome;

            if (match.scoreHome > match.scoreAway) { h.won++; h.points += 3; a.lost++; }
            else if (match.scoreHome < match.scoreAway) { a.won++; a.points += 3; h.lost++; }
            else { h.drawn++; h.points += 1; a.drawn++; a.points += 1; }
        });

        this.teams.sort((a, b) => {
            if (b.points !== a.points) return b.points - a.points;
            const diffA = a.goalsFor - a.goalsAgainst;
            const diffB = b.goalsFor - b.goalsAgainst;
            if (diffB !== diffA) return diffB - diffA;
            return b.goalsFor - a.goalsFor;
        });
        this.renderStandingsTab();
    },

    renderStandingsTab() {
        const container = document.getElementById('tab-standings');
        container.innerHTML = `
            <table class="standings-table">
                <thead>
                    <tr><th>Pos</th><th class="text-left">Équipe</th><th>MJ</th><th>G</th><th>N</th><th>P</th><th>BP</th><th>BC</th><th>DB</th><th>Pts</th></tr>
                </thead>
                <tbody>
                    ${this.teams.map((t, idx) => {
            const db = t.goalsFor - t.goalsAgainst;
            return `
                            <tr>
                                <td><strong>${idx + 1}</strong></td>
                                <td class="text-left team-cell-logo">
                                    <img src="${t.logo}" class="team-logo-table" alt="logo">
                                    <strong>${t.name}</strong>
                                </td>
                                <td>${t.played}</td><td>${t.won}</td><td>${t.drawn}</td><td>${t.lost}</td>
                                <td>${t.goalsFor}</td><td>${t.goalsAgainst}</td>
                                <td>${db > 0 ? '+' + db : db}</td>
                                <td><span class="pts-badge">${t.points}</span></td>
                            </tr>
                        `;
        }).join('')}
                </tbody>
            </table>
        `;
    },

    // =========================================================================
    // PARTIE 4 : LOGIQUE DU MODE TOURNOI (PHASE DE GROUPES)
    // =========================================================================

    generateWorldCup() {
        this.tournamentPhase = 'groups';
        this.groups = {};
        this.groupFixtures = {};
        let shuffled = [...this.teams].sort(() => Math.random() - 0.5);
        const teamsPerGroup = 4;
        const numGroups = Math.ceil(shuffled.length / teamsPerGroup);

        for (let i = 0; i < numGroups; i++) {
            const groupLetter = String.fromCharCode(65 + i);
            this.groups[groupLetter] = shuffled.slice(i * teamsPerGroup, (i + 1) * teamsPerGroup);
            this.generateGroupFixtures(groupLetter);
        }
        document.getElementById('tab-link-bracket').style.display = 'none';
        this.renderGroupsTab();
    },

    generateGroupFixtures(groupLetter) {
        let pool = [...this.groups[groupLetter]];
        if (pool.length % 2 !== 0) pool.push(new Team("Exempt"));
        const numTeams = pool.length;
        const rounds = numTeams - 1;

        this.groupFixtures[groupLetter] = [];
        for (let r = 0; r < rounds; r++) {
            for (let i = 0; i < numTeams / 2; i++) {
                const home = pool[i]; const away = pool[numTeams - 1 - i];
                if (home.name !== "Exempt" && away.name !== "Exempt") {
                    this.groupFixtures[groupLetter].push(new Match(home, away));
                }
            }
            pool.splice(1, 0, pool.pop());
        }
    },

    renderGroupsTab() {
        const container = document.getElementById('tab-matches');
        container.innerHTML = `<h2 class="phase-title">🏆 Phase de Groupes</h2>`;

        Object.keys(this.groups).forEach(groupLetter => {
            const groupSection = document.createElement('div');
            groupSection.className = 'group-section';
            this.computeGroupStandings(groupLetter);

            groupSection.innerHTML = `
                <div class="group-header">Groupe ${groupLetter}</div>
                <div class="group-body">
                    <div class="group-table-side">
                        <table class="standings-table compact">
                            <thead><tr><th>Pos</th><th class="text-left">Équipe</th><th>Pts</th><th>DB</th></tr></thead>
                            <tbody>
                                ${this.groups[groupLetter].map((t, idx) => `
                                    <tr class="${idx < 2 ? 'qualified-row' : ''}">
                                        <td>${idx + 1}</td><td class="text-left">${t.name}</td>
                                        <td><strong>${t.points}</strong></td><td>${t.goalsFor - t.goalsAgainst}</td>
                                    </tr>
                                `).join('')}
                            </tbody>
                        </table>
                    </div>
                    <div class="group-matches-side">
                        <div class="matches-list">
                            ${this.groupFixtures[groupLetter].map((match, mIdx) => `
                                <div class="match-card compact-card">
                                    <span class="team-name text-right">${match.home.name}</span>
                                    <button class="btn-score-trigger compact-btn" onclick="App.openMatchModal('worldcup', '${groupLetter}', ${mIdx})">
                                        ${match.played ? `${match.scoreHome} : ${match.scoreAway}` : 'Score'}
                                    </button>
                                    <span class="team-name text-left">${match.away.name}</span>
                                </div>
                            `).join('')}
                        </div>
                    </div>
                </div>
            `;
            container.appendChild(groupSection);
        });
        this.checkGroupPhaseCompletion();
    },

    computeGroupStandings(groupLetter) {
        this.groups[groupLetter].forEach(t => { t.points = 0; t.goalsFor = 0; t.goalsAgainst = 0; });
        this.groupFixtures[groupLetter].forEach(match => {
            if (!match.played) return;
            const h = match.home; const a = match.away;
            h.goalsFor += match.scoreHome; h.goalsAgainst += match.scoreAway;
            a.goalsFor += match.scoreAway; a.goalsAgainst += match.scoreHome;

            if (match.scoreHome > match.scoreAway) h.points += 3;
            else if (match.scoreHome < match.scoreAway) a.points += 3;
            else { h.points += 1; a.points += 1; }
        });

        this.groups[groupLetter].sort((a, b) => {
            if (b.points !== a.points) return b.points - a.points;
            return (b.goalsFor - b.goalsAgainst) - (a.goalsFor - a.goalsAgainst);
        });
    },

    checkGroupPhaseCompletion() {
        let allPlayed = true;
        Object.values(this.groupFixtures).flat().forEach(m => { if (!m.played) allPlayed = false; });

        if (allPlayed && Object.keys(this.groups).length >= 2) {
            const container = document.getElementById('tab-matches');
            let btn = document.getElementById('btn-generate-knockout');
            if (!btn) {
                btn = document.createElement('button');
                btn.id = 'btn-generate-knockout';
                btn.className = 'btn-main';
                btn.innerHTML = "Générer la Phase Finale (Arbre) 🏆";
                btn.onclick = () => App.generateKnockoutBracket();
                container.appendChild(btn);
            }
        }
    },

    // =========================================================================
    // PARTIE 5 : LOGIQUE DE L'ARBRE FINAL (ÉLIMINATION DIRECTE)
    // =========================================================================

    generateKnockoutBracket() {
        this.tournamentPhase = 'knockout';
        const groups = Object.keys(this.groups).sort();
        let qualified = [];
        groups.forEach(letter => {
            if (this.groups[letter][0]) qualified.push(this.groups[letter][0]);
            if (this.groups[letter][1]) qualified.push(this.groups[letter][1]);
        });

        if (qualified.length < 4) {
            alert("Pas assez d'équipes qualifiées pour générer des demi-finales.");
            return;
        }

        let demi1, demi2;
        if (groups.length >= 2) {
            const firstGroup = this.groups[groups[0]];
            const secondGroup = this.groups[groups[1]];
            demi1 = new Match(firstGroup[0] || new Team("À Déterminer"), secondGroup[1] || new Team("À Déterminer"));
            demi2 = new Match(secondGroup[0] || new Team("À Déterminer"), firstGroup[1] || new Team("À Déterminer"));
        } else {
            demi1 = new Match(qualified[0], qualified[3] || new Team("À Déterminer"));
            demi2 = new Match(qualified[2] || new Team("À Déterminer"), qualified[1]);
        }

        this.bracket = {
            demis: [demi1, demi2],
            finale: [new Match(new Team("À Déterminer"), new Team("À Déterminer"))]
        };

        document.getElementById('tab-link-bracket').style.display = 'block';
        this.switchTab('bracket');
        this.renderBracket();
    },

    renderBracket() {
        const container = document.getElementById('bracket-container');
        const finalMatch = this.bracket.finale[0];
        const champion = finalMatch?.played ? (finalMatch.scoreHome > finalMatch.scoreAway ? finalMatch.home.name : finalMatch.away.name) : null;
        const statusText = champion ? `🏅 Champion : ${champion}` : "Remplissez les scores de demi-finales puis de la finale pour désigner le vainqueur.";

        container.innerHTML = `
            <div class="bracket-status">${statusText}</div>
            <div class="bracket-columns">
                <div class="bracket-column">
                    <h3>Demi-finales</h3>
                    ${this.bracket.demis.map((match, idx) => this.getBracketMatchHTML('demis', idx, match)).join('')}
                </div>
                <div class="bracket-column">
                    <h3>Finale</h3>
                    ${this.bracket.finale.map((match, idx) => this.getBracketMatchHTML('finale', idx, match)).join('')}
                </div>
            </div>
        `;
    },

    getBracketMatchHTML(phase, idx, match) {
        const disabled = (match.home.name.includes("À Déterminer") || match.away.name.includes("À Déterminer")) ? 'disabled' : '';
        const homeScore = match.scoreHome !== null ? match.scoreHome : '';
        const awayScore = match.scoreAway !== null ? match.scoreAway : '';
        const resultLabel = match.played ? `<div class="bracket-result">Vainqueur : <strong>${match.scoreHome > match.scoreAway ? match.home.name : match.away.name}</strong></div>` : "";

        return `
            <div class="match-card bracket-card">
                <div class="bracket-team">
                    <span>${match.home.name}</span>
                    <input type="number" ${disabled} min="0" placeholder="0" value="${homeScore}"
                        oninput="App.updateBracketScore('${phase}', ${idx}, 'home', this.value)">
                </div>
                <div class="bracket-team">
                    <span>${match.away.name}</span>
                    <input type="number" ${disabled} min="0" placeholder="0" value="${awayScore}"
                        oninput="App.updateBracketScore('${phase}', ${idx}, 'away', this.value)">
                </div>
                ${resultLabel}
            </div>
        `;
    },

    updateBracketScore(phase, idx, side, value) {
        const match = this.bracket[phase][idx];
        const val = value === "" ? null : parseInt(value);

        if (side === 'home') match.scoreHome = val;
        if (side === 'away') match.scoreAway = val;

        if (match.scoreHome !== null && match.scoreAway !== null) {
            if (match.scoreHome === match.scoreAway) {
                alert("Match éliminatoire : Pas de match nul possible (Simulez des tirs au but) !");
                return;
            }
            match.played = true;
            const winner = match.scoreHome > match.scoreAway ? match.home : match.away;

            if (phase === 'demis') {
                if (idx === 0) this.bracket.finale[0].home = winner;
                if (idx === 1) this.bracket.finale[0].away = winner;
            } else if (phase === 'finale') {
                this.announceChampion(winner.name);
            }
            this.saveToLocalStorage();
        }
        this.renderBracket();
    },

    announceChampion(winnerName) {
        try {
            const message = `🎉 Félicitations à ${winnerName} — Champion du tournoi ! 🏆`;
            this.showChampionModal(winnerName, message);
            // Optionally sync to Firebase as a final state
            if (this.firebaseEnabled && this.firebaseStore) {
                try { this.syncToFirebase().catch(() => { }); } catch (e) { }
            }
        } catch (e) { console.warn('Erreur announceChampion', e); }
    },

    showChampionModal(winnerName, message) {
        const modal = document.getElementById('champion-modal');
        const body = document.getElementById('champion-modal-body');
        const title = document.getElementById('champion-modal-title');
        const shareBtn = document.getElementById('champion-share-btn');
        const fbBtn = document.getElementById('champion-share-fb');
        const twBtn = document.getElementById('champion-share-tw');
        if (title) title.textContent = `🏆 Champion : ${winnerName}`;
        if (body) body.innerHTML = `<p class="subtitle">${message}</p><p>Merci d'avoir organisé/participé à ce tournoi.</p>`;
        const shareText = `${message} Rejoignez-nous sur ${window.location.origin}`;
        // store last champion for share buttons
        this._lastChampion = winnerName;
        this._lastChampionText = shareText;
        if (shareBtn) shareBtn.onclick = () => this.shareChampion(this._lastChampion, this._lastChampionText);
        if (fbBtn) fbBtn.onclick = () => this.shareFacebook(this._lastChampion, this._lastChampionText);
        if (twBtn) twBtn.onclick = () => this.shareTwitter(this._lastChampion, this._lastChampionText);
        if (modal) modal.classList.remove('hidden');
        try { this.launchConfetti(); } catch (e) { console.warn('confetti fail', e); }
    },

    closeChampionModal() {
        const modal = document.getElementById('champion-modal');
        if (modal) modal.classList.add('hidden');
    },

    shareChampion(winnerName, shareText) {
        const text = shareText || `Félicitations à ${winnerName} — Champion !`;
        if (navigator.share) {
            navigator.share({ title: `Champion: ${winnerName}`, text }).catch(() => {
                window.open(`https://wa.me/?text=${encodeURIComponent(text)}`, '_blank');
            });
            return;
        }
        try { window.open(`https://wa.me/?text=${encodeURIComponent(text)}`, '_blank'); } catch (e) { try { navigator.clipboard.writeText(text); alert('Message copié.'); } catch (e2) { alert(text); } }
    },

    launchConfetti() {
        const duration = 4500;
        const canvas = document.getElementById('confetti-canvas');
        if (!canvas) return;
        canvas.style.display = 'block';
        const ctx = canvas.getContext('2d');
        let w = canvas.width = window.innerWidth; let h = canvas.height = window.innerHeight;
        const colors = ['#f59e0b', '#ef4444', '#10b981', '#3b82f6', '#8b5cf6'];
        const particles = [];
        const count = 220;
        for (let i = 0; i < count; i++) {
            particles.push({
                x: Math.random() * w,
                y: Math.random() * -h,
                vx: (Math.random() - 0.5) * 6,
                vy: Math.random() * 6 + 2,
                r: Math.random() * 6 + 4,
                color: colors[Math.floor(Math.random() * colors.length)],
                rot: Math.random() * Math.PI,
                vr: (Math.random() - 0.5) * 0.2
            });
        }
        let start = Date.now();
        function step() {
            const now = Date.now();
            const t = (now - start) / duration;
            ctx.clearRect(0, 0, w, h);
            particles.forEach(p => {
                p.vy += 0.08; // gravity
                p.x += p.vx;
                p.y += p.vy;
                p.rot += p.vr;
                ctx.save();
                ctx.translate(p.x, p.y);
                ctx.rotate(p.rot);
                ctx.fillStyle = p.color;
                ctx.fillRect(-p.r / 2, -p.r / 2, p.r, p.r * 0.6);
                ctx.restore();
            });
            if (now - start < duration) {
                requestAnimationFrame(step);
            } else {
                ctx.clearRect(0, 0, w, h);
                canvas.style.display = 'none';
            }
        }
        window.addEventListener('resize', () => { w = canvas.width = window.innerWidth; h = canvas.height = window.innerHeight; });
        step();
    },

    shareFacebook(winnerName, shareText) {
        const text = shareText || `Félicitations à ${winnerName} — Champion !`;
        const url = encodeURIComponent(window.location.href);
        const quote = encodeURIComponent(text);
        window.open(`https://www.facebook.com/sharer/sharer.php?u=${url}&quote=${quote}`, '_blank');
    },

    shareTwitter(winnerName, shareText) {
        const text = shareText || `Félicitations à ${winnerName} — Champion !`;
        const url = encodeURIComponent(window.location.href);
        window.open(`https://twitter.com/intent/tweet?text=${encodeURIComponent(text)}&url=${url}`, '_blank');
    },

    // =========================================================================
    // PARTIE 6 : INTERACTION MODALE & STATISTIQUES DES JOUEURS
    // =========================================================================

    openMatchModal(type, firstIndex, secondIndex) {
        let match;
        if (type === 'championship') {
            match = this.fixtures[firstIndex][secondIndex];
            this.activeMatchData = { type, round: firstIndex, match: secondIndex };
        } else {
            match = this.groupFixtures[firstIndex][secondIndex];
            this.activeMatchData = { type, group: firstIndex, match: secondIndex };
        }

        document.getElementById('modal-home-name').textContent = match.home.name;
        document.getElementById('modal-away-name').textContent = match.away.name;
        document.getElementById('modal-score-home').value = match.scoreHome !== null ? match.scoreHome : '';
        document.getElementById('modal-score-away').value = match.scoreAway !== null ? match.scoreAway : '';
        document.getElementById('modal-events-selectors').innerHTML = "";

        if (match.played) this.generateEventsForm();
        document.getElementById('match-modal').classList.remove('hidden');
    },

    closeModal() {
        document.getElementById('match-modal').classList.add('hidden');
        this.activeMatchData = null;
    },

    generateEventsForm() {
        const scoreHome = parseInt(document.getElementById('modal-score-home').value) || 0;
        const scoreAway = parseInt(document.getElementById('modal-score-away').value) || 0;

        let match = this.activeMatchData.type === 'championship'
            ? this.fixtures[this.activeMatchData.round][this.activeMatchData.match]
            : this.groupFixtures[this.activeMatchData.group][this.activeMatchData.match];

        const container = document.getElementById('modal-events-selectors');
        container.innerHTML = "<h4>Détails des Actions</h4>";

        if (scoreHome > 0) {
            container.innerHTML += `<h5>Buteurs : ${match.home.name}</h5>`;
            for (let i = 0; i < scoreHome; i++) container.appendChild(this.createEventRowHTML(match.home, 'home', i));
        }
        if (scoreAway > 0) {
            container.innerHTML += `<h5>Buteurs : ${match.away.name}</h5>`;
            for (let i = 0; i < scoreAway; i++) container.appendChild(this.createEventRowHTML(match.away, 'away', i));
        }
    },

    createEventRowHTML(team, side, goalIndex) {
        const row = document.createElement('div');
        row.className = 'modal-event-row';
        const scorerOptions = team.players.map(p => `<option value="${p.name}">🏃 ${p.name}</option>`).join('');
        const assistantOptions = `<option value="">Pas de passeur</option>` + team.players.map(p => `<option value="${p.name}">👟 ${p.name}</option>`).join('');

        // Ajout de sélecteurs pour les cartons jaunes et rouges reçus pendant le match
        row.innerHTML = `
            <span>But n°${goalIndex + 1} :</span>
            <select class="sc-select" data-side="${side}" data-type="scorer">${scorerOptions}</select>
            <select class="as-select" data-side="${side}" data-type="assistant">${assistantOptions}</select>
            <div class="cards-checkboxes">
                <label><input type="checkbox" class="yc-check" data-side="${side}"> 🟨</label>
                <label><input type="checkbox" class="rc-check" data-side="${side}"> 🟥</label>
            </div>
        `;
        return row;
    },

    saveMatchEvents() {
        const scoreHomeInput = document.getElementById('modal-score-home').value;
        const scoreAwayInput = document.getElementById('modal-score-away').value;

        if (scoreHomeInput === "" || scoreAwayInput === "") {
            alert("Saisissez un score."); return;
        }

        let match = this.activeMatchData.type === 'championship'
            ? this.fixtures[this.activeMatchData.round][this.activeMatchData.match]
            : this.groupFixtures[this.activeMatchData.group][this.activeMatchData.match];

        if (match.played) this.removeMatchStatsFromPlayers(match);

        match.scoreHome = parseInt(scoreHomeInput);
        match.scoreAway = parseInt(scoreAwayInput);
        match.played = true;
        match.events = [];

        // Et remplacez son contenu intérieur par ceci :
        document.querySelectorAll('.modal-event-row').forEach(row => {
            const side = row.querySelector('[data-type="scorer"]').dataset.side;
            const scorerName = row.querySelector('[data-type="scorer"]').value;
            const assistantName = row.querySelector('[data-type="assistant"]').value;
            const hasYellow = row.querySelector('.yc-check').checked;
            const hasRed = row.querySelector('.rc-check').checked;

            const team = side === 'home' ? match.home : match.away;

            const scorerObj = team.players.find(p => p.name === scorerName);
            if (scorerObj) {
                scorerObj.goals++;
                if (hasYellow) scorerObj.yellowCards++;
                if (hasRed) scorerObj.redCards++;
            }

            if (assistantName) {
                const assistantObj = team.players.find(p => p.name === assistantName);
                if (assistantObj) assistantObj.assists++;
            }

            match.events.push({
                scorer: scorerName,
                assistant: assistantName,
                side: side,
                yellow: hasYellow,
                red: hasRed
            });
        });


        if (this.activeMatchData.type === 'championship') {
            this.computeStandings(); this.renderMatchesTab();
        } else {
            this.renderGroupsTab();
        }

        this.saveToLocalStorage();
        this.closeModal();
    },

    removeMatchStatsFromPlayers(oldMatch) {
        oldMatch.events.forEach(ev => {
            const team = ev.side === 'home' ? oldMatch.home : oldMatch.away;
            const scorer = team.players.find(p => p.name === ev.scorer);
            if (scorer) {
                scorer.goals--;
                if (ev.yellow) scorer.yellowCards--;
                if (ev.red) scorer.redCards--;
            }
            if (ev.assistant) {
                const assistant = team.players.find(p => p.name === ev.assistant);
                if (assistant) assistant.assists--;
            }
        });
    },


    renderPlayerStats() {
        let allPlayers = this.teams.flatMap(t => t.players);
        let topScorers = [...allPlayers].filter(p => p.goals > 0).sort((a, b) => b.goals - a.goals).slice(0, 10);
        let topAssists = [...allPlayers].filter(p => p.assists > 0).sort((a, b) => b.assists - a.assists).slice(0, 10);

        document.getElementById('scorers-list').innerHTML = topScorers.length ? topScorers.map((p, idx) => `
            <li><span class="rank-badge">${idx + 1}</span> <strong>${p.name}</strong> <span class="stat-count">${p.goals} Buts</span></li>
        `).join('') : "<p class='placeholder-text'>Aucun but.</p>";

        document.getElementById('assists-list').innerHTML = topAssists.length ? topAssists.map((p, idx) => `
            <li><span class="rank-badge civil">${idx + 1}</span> <strong>${p.name}</strong> <span class="stat-count assist">${p.assists} Passes</span></li>
        `).join('') : "<p class='placeholder-text'>Aucune passe.</p>";
    },

    // =========================================================================
    // PARTIE 7 : JOURNALISME MEDIA, STOCKAGE LOCAL & FERMETURE DE L'OBJET
    // =========================================================================

    generateMediaArticles() {
        const feed = document.getElementById('media-feed');
        feed.innerHTML = "";
        let playedMatches = [];

        if (this.mode === 'championship') {
            playedMatches = this.fixtures.flat().filter(m => m.played);
        } else {
            playedMatches = Object.values(this.groupFixtures).flat().filter(m => m.played);
            if (this.bracket && this.bracket.demis) playedMatches.push(...this.bracket.demis.filter(m => m.played));
            if (this.bracket && this.bracket.finale) playedMatches.push(...this.bracket.finale.filter(m => m.played));
        }

        if (playedMatches.length === 0) {
            feed.innerHTML = "<p class='placeholder-text'>Jouez des matchs pour remplir les journaux !</p>";
            return;
        }

        [...playedMatches].reverse().slice(0, 5).forEach(match => {
            const article = document.createElement('div');
            article.className = 'media-card-article';
            let title = ""; let body = "";
            const scorerText = match.events.length > 0
                ? `grâce à des réalisations de ${[...new Set(match.events.map(e => e.scorer))].join(', ')}`
                : "au terme d'une rencontre très fermée";

            if (match.scoreHome === match.scoreAway) {
                if (match.scoreHome === 0) {
                    title = `⚽ Ennui mortel entre ${match.home.name} et ${match.away.name}`;
                    body = `Les spectateurs ont assisté à un bien triste spectacle aujourd'hui. Score final 0-0. Un manque d'ambition flagrant offensivement.`;
                } else {
                    title = `🔥 Parité spectaculaire entre ${match.home.name} et ${match.away.name} (${match.scoreHome}-${match.scoreAway})`;
                    body = `Quel match ! Aucune des deux équipes n'a voulu céder. Un nul logique ${scorerText}. Les attaquants ont régalé le public.`;
                }
            } else {
                const winner = match.scoreHome > match.scoreAway ? match.home.name : match.away.name;
                const loser = match.scoreHome > match.scoreAway ? match.away.name : match.home.name;
                const scoreWinner = Math.max(match.scoreHome, match.scoreAway);
                const scoreLoser = Math.min(match.scoreHome, match.scoreAway);

                if ((scoreWinner - scoreLoser) >= 3) {
                    title = `🚨 DÉMONSTRATION ! ${winner} écrase totalement ${loser} !`;
                    body = `Il n'y a pas eu de match. ${winner} a surclassé son adversaire sur le score sans appel de ${scoreWinner} à ${scoreLoser} ${scorerText}.`;
                } else {
                    title = `💼 Victoire précieuse pour ${winner} face à ${loser}`;
                    body = `Dans un match à haute tension tactique, ${winner} s'impose sur la plus petite des marges (${scoreWinner}-${scoreLoser}) ${scorerText}.`;
                }
            }

            article.innerHTML = `<div class="media-badge">FLASH INFO</div><h3>${title}</h3><p>${body}</p><div class="media-footer-text">✍️ Rédaction sportive</div>`;
            feed.appendChild(article);
        });
    },

    resetCurrentTournamentState() {
        this.mode = null;
        this.teams = [];
        this.fixtures = [];
        this.groups = {};
        this.groupFixtures = {};
        this.bracket = {};
        this.tournamentPhase = 'groups';
        this.activeMatchData = null;
        this.tournamentName = '';
        this.tournamentLogo = '';
        this.tournamentConfirmed = false;
        this.activeTournamentId = null;
        this.activeTournamentName = '';
    },

    saveToLocalStorage() {
        const dataToSave = {
            mode: this.mode, teams: this.teams, fixtures: this.fixtures,
            groups: this.groups, groupFixtures: this.groupFixtures,
            bracket: this.bracket, tournamentPhase: this.tournamentPhase,
            tournamentName: this.tournamentName, tournamentLogo: this.tournamentLogo,
            tournamentConfirmed: this.tournamentConfirmed,
            userRole: this.userRole,
            userTeam: this.userTeam,
            userProfile: this.userProfile,
            lastFirebaseSyncAt: this.lastFirebaseSyncAt,
            tournaments: this.tournaments || [],
            activeTournamentId: this.activeTournamentId,
            activeTournamentName: this.activeTournamentName,
            organizerProfile: this.organizerProfile,
            invitations: this.invitations
        };
        localStorage.setItem('football_manager_save', JSON.stringify(dataToSave));
        this.scheduleFirebaseSync();
    },

    loadFromLocalStorage() {
        const savedData = localStorage.getItem('football_manager_save');
        if (!savedData) return false;
        try {
            const data = JSON.parse(savedData);
            this.mode = data.mode; this.teams = data.teams; this.fixtures = data.fixtures;
            this.groups = data.groups; this.groupFixtures = data.groupFixtures;
            this.bracket = data.bracket; this.tournamentPhase = data.tournamentPhase;
            this.tournamentName = data.tournamentName || '';
            this.tournamentLogo = data.tournamentLogo || '';
            this.tournamentConfirmed = data.tournamentConfirmed || false;
            if (data.userRole !== undefined) this.userRole = data.userRole;
            if (data.userTeam !== undefined) this.userTeam = data.userTeam;
            if (data.userProfile !== undefined) this.userProfile = data.userProfile;
            if (data.lastFirebaseSyncAt !== undefined) this.lastFirebaseSyncAt = data.lastFirebaseSyncAt;
            this.tournaments = data.tournaments || this.tournaments || [];
            if (data.activeTournamentId !== undefined) this.activeTournamentId = data.activeTournamentId;
            if (data.activeTournamentName !== undefined) this.activeTournamentName = data.activeTournamentName;
            this.organizerProfile = data.organizerProfile || this.organizerProfile;
            this.invitations = data.invitations || this.invitations || [];

            const nameInput = document.getElementById('tournament-name-input');
            const logoInput = document.getElementById('tournament-logo-input');
            if (nameInput) nameInput.value = this.tournamentName;
            if (logoInput) logoInput.value = this.tournamentLogo;

            if (this.mode === 'worldcup' && this.tournamentPhase === 'knockout') {
                document.getElementById('tab-link-bracket').style.display = 'block';
            }
            this.updateTournamentPreview();

            if (this.mode === 'championship') {
                this.computeStandings();
            } else if (this.mode && this.tournamentPhase === 'groups') {
                Object.keys(this.groups).forEach(group => this.computeGroupStandings(group));
            }
            this.renderJoinRequests();
            return true;
        } catch (e) { return false; }
    },

    restoreOrganizerProfile() {
        if (this.organizerProfile) return;
        const savedData = localStorage.getItem('football_manager_save');
        if (!savedData) return;
        try {
            const data = JSON.parse(savedData);
            this.organizerProfile = data.organizerProfile || null;
        } catch (e) {
            // ignore
        }
    },

    async persistOrganizerAndTournament(profile, tournament) {
        const db = await this.openDatabase();
        const txn = db.transaction(['organizers', 'tournaments'], 'readwrite');
        txn.objectStore('organizers').put(profile);
        txn.objectStore('tournaments').put(tournament);
        await new Promise((resolve, reject) => {
            txn.oncomplete = () => resolve();
            txn.onerror = () => reject(txn.error);
        });
    },

    async getTournamentsFromIndexedDB() {
        try {
            const db = await this.openDatabase();
            const txn = db.transaction(['tournaments'], 'readonly');
            const store = txn.objectStore('tournaments');
            const items = await new Promise((resolve, reject) => {
                const req = store.getAll();
                req.onsuccess = () => resolve(req.result || []);
                req.onerror = () => reject(req.error);
            });
            return items;
        } catch (error) {
            return [];
        }
    },

    openDatabase() {
        return new Promise((resolve, reject) => {
            const request = indexedDB.open('tfball-db', 1);
            request.onupgradeneeded = () => {
                const db = request.result;
                if (!db.objectStoreNames.contains('organizers')) {
                    db.createObjectStore('organizers', { keyPath: 'id' });
                }
                if (!db.objectStoreNames.contains('tournaments')) {
                    db.createObjectStore('tournaments', { keyPath: 'id' });
                }
            };
            request.onsuccess = () => resolve(request.result);
            request.onerror = () => reject(request.error);
        });
    },

    resetApplication() {
        if (confirm("Réinitialiser l'application ?")) {
            localStorage.removeItem('football_manager_save');
            localStorage.removeItem('tfball-current-user');
            if (window.indexedDB) {
                try {
                    const deleteReq = indexedDB.deleteDatabase('tfball-db');
                    deleteReq.onsuccess = () => window.location.reload();
                    deleteReq.onerror = () => window.location.reload();
                } catch (e) {
                    window.location.reload();
                }
            } else {
                window.location.reload();
            }
        }
    }
}; // <-- CETTE ACCOLADE FERME SÉCURISÉMENT L'OBJET GLOBAL APP

App.updateHeaderActiveTab = function () {
    const visible = document.querySelector('.screen:not(.hidden)');
    const visibleId = visible ? visible.id : null;
    const homeScreens = ['screen-auth', 'screen-mode', 'screen-dashb'];
    document.querySelectorAll('.nav-links .nav-link').forEach(b => {
        const target = b.getAttribute('data-screen');
        const isActive = target === 'home'
            ? homeScreens.includes(visibleId)
            : target === visibleId;
        if (target && isActive) {
            b.classList.add('active');
        } else {
            b.classList.remove('active');
        }
    });
};

// Déclenchement au chargement du DOM
window.addEventListener('DOMContentLoaded', () => {
    App.init();
    // Setup responsive nav toggle
    const navToggle = document.getElementById('nav-toggle');
    const navLinks = document.getElementById('nav-links');
    if (navToggle && navLinks) {
        navToggle.addEventListener('click', (e) => {
            navLinks.classList.toggle('open');
        });
        // Close menu when clicking a link
        navLinks.querySelectorAll('.nav-link').forEach(a => a.addEventListener('click', () => navLinks.classList.remove('open')));
        // Close on outside click
        document.addEventListener('click', (ev) => {
            if (!navLinks.classList.contains('open')) return;
            const target = ev.target;
            if (!navLinks.contains(target) && target !== navToggle) {
                navLinks.classList.remove('open');
            }
        });
    }
});
