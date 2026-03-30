import { api, setApiToken } from "./client";

export async function validateToken(token: string) {
  setApiToken(token);
  try {
    const response = await api.get("/health");
    return response.data;
  } catch (error) {
    setApiToken("");
    throw error;
  }
}
