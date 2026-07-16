(function (root, factory) {
    const api = factory();
    if (typeof module !== 'undefined' && module.exports) {
        module.exports = api;
    }
    root.TFBallFirebase = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
    function buildStateSnapshot(app) {
        return {
            version: 1,
            updatedAt: new Date().toISOString(),
            organizerProfile: app.organizerProfile || null,
            appState: {
                mode: app.mode || null,
                teams: Array.isArray(app.teams) ? app.teams : [],
                fixtures: Array.isArray(app.fixtures) ? app.fixtures : [],
                groups: app.groups || {},
                groupFixtures: app.groupFixtures || {},
                bracket: app.bracket || {},
                tournamentPhase: app.tournamentPhase || 'groups',
                tournamentName: app.tournamentName || '',
                tournamentLogo: app.tournamentLogo || '',
                tournamentConfirmed: !!app.tournamentConfirmed,
                userRole: app.userRole || null,
                userTeam: app.userTeam || '',
                userProfile: app.userProfile || null,
                tournaments: Array.isArray(app.tournaments) ? app.tournaments : [],
                activeTournamentId: app.activeTournamentId || null,
                activeTournamentName: app.activeTournamentName || '',
                invitations: Array.isArray(app.invitations) ? app.invitations : []
            }
        };
    }

    function mergeStateSnapshot(snapshot, app) {
        if (!snapshot || typeof snapshot !== 'object') return false;

        const state = snapshot.appState || {};
        if (state.mode !== undefined) app.mode = state.mode;
        if (Array.isArray(state.teams)) app.teams = state.teams;
        if (Array.isArray(state.fixtures)) app.fixtures = state.fixtures;
        if (state.groups) app.groups = state.groups;
        if (state.groupFixtures) app.groupFixtures = state.groupFixtures;
        if (state.bracket) app.bracket = state.bracket;
        if (state.tournamentPhase) app.tournamentPhase = state.tournamentPhase;
        if (state.tournamentName !== undefined) app.tournamentName = state.tournamentName;
        if (state.tournamentLogo !== undefined) app.tournamentLogo = state.tournamentLogo;
        if (state.tournamentConfirmed !== undefined) app.tournamentConfirmed = !!state.tournamentConfirmed;
        if (state.userRole !== undefined) app.userRole = state.userRole;
        if (state.userTeam !== undefined) app.userTeam = state.userTeam;
        if (state.userProfile !== undefined) app.userProfile = state.userProfile;
        if (Array.isArray(state.tournaments)) app.tournaments = state.tournaments;
        if (state.activeTournamentId !== undefined) app.activeTournamentId = state.activeTournamentId;
        if (state.activeTournamentName !== undefined) app.activeTournamentName = state.activeTournamentName;
        if (Array.isArray(state.invitations)) app.invitations = state.invitations;
        if (snapshot.organizerProfile) app.organizerProfile = snapshot.organizerProfile;
        if (snapshot.updatedAt) app.lastFirebaseSyncAt = snapshot.updatedAt;

        return true;
    }

    return {
        buildStateSnapshot,
        mergeStateSnapshot
    };
});
