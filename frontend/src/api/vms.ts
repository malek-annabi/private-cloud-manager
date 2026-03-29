import { api } from "./client";

export const fetchVMs = async () => {
  const res = await api.get("/vms");
  return res.data;
};