type Client = {
  tenantKey: string;
  res: { write: (chunk: string) => void };
};

const clients: Client[] = [];

export function addClient(tenantKey: string, res: { write: (chunk: string) => void }) {
  clients.push({ tenantKey, res });
}

export function removeClient(res: { write: (chunk: string) => void }) {
  const idx = clients.findIndex((c) => c.res === res);
  if (idx >= 0) clients.splice(idx, 1);
}

export function publish(tenantKey: string, event: unknown) {
  const data = `data: ${JSON.stringify(event)}\n\n`;
  for (const c of clients) {
    if (c.tenantKey === tenantKey) {
      try {
        c.res.write(data);
      } catch {
        // ignore broken pipes
      }
    }
  }
}