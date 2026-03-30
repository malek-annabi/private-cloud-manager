import axios from "axios";

const TOKEN_STORAGE_KEY = "pcm.apiToken";

let apiToken =
  typeof window !== "undefined"
    ? window.localStorage.getItem(TOKEN_STORAGE_KEY) ?? ""
    : "";

export const api = axios.create({
  baseURL: "http://127.0.0.1:8000/api",
});

export function getApiToken() {
  return apiToken;
}

export function setApiToken(token: string) {
  apiToken = token;

  if (typeof window !== "undefined") {
    if (token) {
      window.localStorage.setItem(TOKEN_STORAGE_KEY, token);
    } else {
      window.localStorage.removeItem(TOKEN_STORAGE_KEY);
    }
  }
}

api.interceptors.request.use((config) => {
  if (apiToken) {
    config.headers.Authorization = `Bearer ${apiToken}`;
  }
  return config;
});
