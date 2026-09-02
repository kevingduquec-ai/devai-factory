export const API_URL = process.env.API_URL ?? "http://localhost:4000/api";

export const ACCESS_TOKEN_COOKIE = "devai_access_token";
export const REFRESH_TOKEN_COOKIE = "devai_refresh_token";

/** Sesión de super-admin — cookie separada de la de usuarios de organización. */
export const ADMIN_ACCESS_TOKEN_COOKIE = "qubit_admin_token";
