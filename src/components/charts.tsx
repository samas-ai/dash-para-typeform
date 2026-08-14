/**
 * Gráficos renderizados no servidor, sem biblioteca e sem JS no cliente.
 *
 * Decisões que valem para todos os gráficos daqui:
 * - Uma hue só. O trabalho do leitor é comparar tamanhos, não distinguir
 *   identidades, então cor por categoria seria ruído (e um risco de daltonismo
 *   de graça).
 * - Todo valor aparece como texto, nunca só como comprimento de barra. Os
 *   tooltips (`<title>`) complementam; não são o único caminho para o dado.
 * - Marcas finas, grade em hairline: o dado é a única coisa que pode ser forte.
 */

const BAR_RADIUS = "4px";

/** Escala o eixo até um número redondo e divisível por 4, para ticks inteiros. */
function niceMax(value: number): number {
  if (value <= 4) return 4;
  const magnitude = 10 ** Math.floor(Math.log10(value));
  for (const step of [1, 1.5, 2, 3, 4, 5, 6, 8, 10]) {
    const candidate = step * magnitude;
    if (candidate >= value) return Math.ceil(candidate / 4) * 4;
  }
  return Math.ceil((10 * magnitude) / 4) * 4;
}

const percent = (part: number, whole: number) =>
  whole === 0 ? 0 : Math.round((part / whole) * 100);

// ---------------------------------------------------------------------------
// Barras horizontais
// ---------------------------------------------------------------------------

/**
 * Barras horizontais em HTML puro.
 *
 * HTML em vez de SVG de propósito: enunciados do Typeform são longos, e aqui o
 * texto quebra em linha em vez de ser cortado pela borda do gráfico.
 */
export function BarList({
  items,
  total,
  emptyLabel = "Sem respostas no período.",
}: {
  items: { label: string; count: number }[];
  total: number;
  emptyLabel?: string;
}) {
  if (items.length === 0) {
    return <p className="text-sm text-muted">{emptyLabel}</p>;
  }

  // Barras proporcionais à maior opção: com poucas respostas, escalar pelo
  // total deixaria todas as barras num toco ilegível.
  const max = Math.max(...items.map((item) => item.count));

  return (
    <ul className="space-y-3">
      {items.map((item) => (
        <li key={item.label}>
          <div className="flex items-baseline justify-between gap-3">
            <span className="text-sm">{item.label}</span>
            <span className="shrink-0 text-sm tabular-nums text-muted">
              {item.count}
              <span className="ml-1.5 text-xs">({percent(item.count, total)}%)</span>
            </span>
          </div>

          <div
            className="mt-1.5 h-2.5 w-full rounded-sm bg-track"
            title={`${item.label}: ${item.count} de ${total}`}
          >
            <div
              className="h-full bg-series"
              style={{
                width: `${Math.max(2, (item.count / max) * 100)}%`,
                // Ponta arredondada no fim do dado, reta na linha de base.
                borderRadius: `0 ${BAR_RADIUS} ${BAR_RADIUS} 0`,
              }}
            />
          </div>
        </li>
      ))}
    </ul>
  );
}

// ---------------------------------------------------------------------------
// Linha do tempo
// ---------------------------------------------------------------------------

const PAD = { top: 16, right: 16, bottom: 28, left: 40 };

const shortDay = new Intl.DateTimeFormat("pt-BR", {
  timeZone: "UTC", // a chave já vem como data local de SP; não reconverter
  day: "2-digit",
  month: "2-digit",
});

const label = (day: string) => shortDay.format(new Date(`${day}T12:00:00Z`));

/**
 * Um SVG que escala proporcionalmente vai de 942px de largura no desktop a
 * ~293px no celular — e a altura desaba junto, achatando o gráfico até ficar
 * ilegível. Em vez de distorcer com preserveAspectRatio="none" (que esticaria
 * texto e transformaria o ponto final numa elipse), desenhamos duas variantes
 * com proporções próprias e deixamos o CSS escolher.
 */
function Plot({
  data,
  width,
  height,
  maxLabels,
}: {
  data: { day: string; count: number }[];
  width: number;
  height: number;
  maxLabels: number;
}) {
  const W = width;
  const H = height;
  const max = niceMax(Math.max(...data.map((d) => d.count)));
  const plotW = W - PAD.left - PAD.right;
  const plotH = H - PAD.top - PAD.bottom;

  // Um ponto só não desenha linha; espalha para as duas pontas do eixo.
  const x = (i: number) =>
    PAD.left + (data.length === 1 ? plotW / 2 : (i / (data.length - 1)) * plotW);
  const y = (value: number) => PAD.top + plotH - (value / max) * plotH;

  const line = data.map((d, i) => `${x(i)},${y(d.count)}`).join(" ");
  const area = `M ${x(0)},${PAD.top + plotH} L ${data
    .map((d, i) => `${x(i)},${y(d.count)}`)
    .join(" L ")} L ${x(data.length - 1)},${PAD.top + plotH} Z`;

  const ticks = [0, 0.25, 0.5, 0.75, 1].map((f) => Math.round(max * f));

  // Limita os rótulos do eixo X à quantidade que cabe sem sobrepor.
  const labelStep = Math.max(1, Math.ceil(data.length / maxLabels));
  const last = data[data.length - 1];

  return (
      <svg
        viewBox={`0 0 ${W} ${H}`}
        className="h-auto w-full"
        role="img"
        aria-label={`Envios por dia. Máximo de ${Math.max(
          ...data.map((d) => d.count),
        )} num único dia.`}
      >
        {/* grade: hairline sólida, um passo fora da superfície */}
        {ticks.map((tick) => (
          <g key={tick}>
            <line
              x1={PAD.left}
              x2={W - PAD.right}
              y1={y(tick)}
              y2={y(tick)}
              className="stroke-grid"
              strokeWidth={1}
            />
            <text
              x={PAD.left - 8}
              y={y(tick) + 4}
              textAnchor="end"
              className="fill-muted text-[11px] tabular-nums"
            >
              {tick}
            </text>
          </g>
        ))}

        {/* área: lavagem a 10%, nunca um bloco saturado */}
        <path d={area} className="fill-series" opacity={0.1} />

        <polyline
          points={line}
          fill="none"
          className="stroke-series"
          strokeWidth={2}
          strokeLinejoin="round"
          strokeLinecap="round"
        />

        {/* ponto final: anel na cor da superfície para não sumir sobre a linha */}
        <circle
          cx={x(data.length - 1)}
          cy={y(last.count)}
          r={4}
          className="fill-series stroke-surface"
          strokeWidth={2}
        />

        {data.map((d, i) => (
          <g key={d.day}>
            {/* alvo de hover largo: a marca real é fina demais para mirar */}
            <rect
              x={x(i) - plotW / data.length / 2}
              y={PAD.top}
              width={Math.max(12, plotW / data.length)}
              height={plotH}
              fill="transparent"
            >
              <title>{`${label(d.day)}: ${d.count} ${
                d.count === 1 ? "envio" : "envios"
              }`}</title>
            </rect>

            {i % labelStep === 0 && (
              <text
                x={x(i)}
                y={H - 8}
                textAnchor="middle"
                className="fill-muted text-[11px] tabular-nums"
              >
                {label(d.day)}
              </text>
            )}
          </g>
        ))}
      </svg>
  );
}

export function TimelineChart({
  data,
}: {
  data: { day: string; count: number }[];
}) {
  if (data.length === 0) {
    return <p className="text-sm text-muted">Sem envios no período.</p>;
  }

  return (
    <figure className="m-0">
      {/* proporção mais alta no celular, mais larga no desktop */}
      <div className="sm:hidden">
        <Plot data={data} width={360} height={240} maxLabels={4} />
      </div>
      <div className="hidden sm:block">
        <Plot data={data} width={720} height={200} maxLabels={6} />
      </div>

      {/* equivalente textual: nenhum valor fica preso ao tooltip */}
      <details className="mt-3">
        <summary className="cursor-pointer text-xs text-muted">
          Ver como tabela
        </summary>
        <table className="mt-2 w-full text-sm">
          <thead>
            <tr className="border-b border-line text-left text-xs text-muted">
              <th className="py-1 font-medium">Dia</th>
              <th className="py-1 text-right font-medium">Envios</th>
            </tr>
          </thead>
          <tbody>
            {data
              .filter((d) => d.count > 0)
              .map((d) => (
                <tr key={d.day} className="border-b border-line/60">
                  <td className="py-1 tabular-nums">{label(d.day)}</td>
                  <td className="py-1 text-right tabular-nums">{d.count}</td>
                </tr>
              ))}
          </tbody>
        </table>
      </details>
    </figure>
  );
}
