import type { ApiEndpointDto, DataModelEntityDto } from "@devai-factory/shared-types";
import {
  DATA_MODEL_CARDINALITY_LABEL_ES,
  DATA_MODEL_KEY_LABEL_ES,
  HTTP_METHOD_LABEL_ES,
  translateFieldType,
} from "@devai-factory/shared-types";
import { Card, CardBadge } from "@/components/ui/card";

const METHOD_TONE: Record<string, "blue" | "green" | "amber" | "red"> = {
  GET: "blue",
  POST: "green",
  PATCH: "amber",
  PUT: "amber",
  DELETE: "red",
};

export function DataModelView({ entities }: { entities: DataModelEntityDto[] }) {
  return (
    <div className="grid gap-4 sm:grid-cols-2">
      {entities.map((entity) => (
        <Card key={entity.id}>
          <p className="font-accent font-semibold text-qubit-navy dark:text-white">{entity.name}</p>
          <div className="mt-2 divide-y divide-border text-sm">
            {entity.fields.map((f, i) => (
              <div key={i} className="flex items-start justify-between gap-3 py-1.5">
                <div>
                  <span className="font-mono text-xs text-foreground">
                    {f.name}
                    {!f.nullable && (
                      <span className="text-red-500" title="Obligatorio">
                        *
                      </span>
                    )}
                  </span>
                  {f.key !== "NONE" && (
                    <span className="ml-1.5">
                      <CardBadge tone={f.key === "PK" ? "blue" : "neutral"} className="!px-1.5 !py-0 text-[10px]">
                        {DATA_MODEL_KEY_LABEL_ES[f.key]}
                        {f.keyTarget ? ` → ${f.keyTarget}` : ""}
                      </CardBadge>
                    </span>
                  )}
                  {f.description && <p className="mt-0.5 text-xs text-muted">{f.description}</p>}
                </div>
                <span className="shrink-0 text-xs text-muted">
                  {translateFieldType(f.dataType)}
                  {f.length ? ` (${f.length})` : ""}
                </span>
              </div>
            ))}
          </div>
          {entity.relations.length > 0 && (
            <ul className="mt-2 space-y-0.5 border-t border-border pt-2 text-xs text-muted">
              {entity.relations.map((r, i) => (
                <li key={i}>
                  {DATA_MODEL_CARDINALITY_LABEL_ES[r.cardinality] ?? r.cardinality} → {r.target}
                  {r.description ? ` — ${r.description}` : ""}
                </li>
              ))}
            </ul>
          )}
        </Card>
      ))}
    </div>
  );
}

export function ApiEndpointsView({ endpoints }: { endpoints: ApiEndpointDto[] }) {
  return (
    <Card className="overflow-x-auto p-0">
      <table className="w-full text-sm">
        <tbody className="divide-y divide-border">
          {endpoints.map((e) => (
            <tr key={e.id}>
              <td className="whitespace-nowrap px-4 py-2.5">
                <span title={HTTP_METHOD_LABEL_ES[e.method]} className="cursor-help">
                  <CardBadge tone={METHOD_TONE[e.method] ?? "neutral"}>{e.method}</CardBadge>
                </span>
              </td>
              <td className="whitespace-nowrap px-2 py-2.5 font-mono text-xs">{e.path}</td>
              <td className="px-4 py-2.5 text-foreground/80">{e.description}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </Card>
  );
}
