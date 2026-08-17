import { permanentRedirect } from "next/navigation";

/**
 * A análise virou a página inicial. Esta rota fica só para não quebrar links
 * já compartilhados, preservando os filtros que estiverem na URL.
 */
export default async function AnaliseRedirect({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = await searchParams;

  const query = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (typeof value === "string") query.set(key, value);
  }

  const string = query.toString();
  permanentRedirect(string ? `/?${string}` : "/");
}
