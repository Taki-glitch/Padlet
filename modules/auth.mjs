export function normalizeUsername(value) {
    return String(value || "").trim().toLowerCase();
}

export function technicalEmail(username) {
    const normalized = normalizeUsername(username);
    return normalized.includes("@") ? normalized : `${normalized}@auth.padlet.invalid`;
}

export function hasAdminRole(profile) {
    return profile?.role === "admin";
}

export function createAuthGateway(supabase) {
    return {
        signInWithUsername(username, password) {
            return supabase.auth.signInWithPassword({ email: technicalEmail(username), password });
        },
        async loadProfile(user) {
            const { data, error } = await supabase.from("profiles").select("username, role").eq("id", user.id).maybeSingle();
            if (error || !data || !["admin", "user"].includes(data.role)) throw new Error("Profil utilisateur introuvable.");
            return data;
        },
        getSession() {
            return supabase.auth.getSession();
        }
    };
}
