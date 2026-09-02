import { z } from "zod";
import { formatUserStorySentence } from "@devai-factory/shared-types";
import { ClaudeClient } from "../claude-client";

const DATA_TYPES = ["INTEGER", "DECIMAL", "VARCHAR", "TEXT", "BOOLEAN", "DATE", "TIMESTAMP", "UUID", "ENUM"] as const;

const DataFieldSchema = z.object({
  name: z.string().describe("Nombre del atributo en snake_case, ej: 'fecha_vencimiento'."),
  dataType: z.enum(DATA_TYPES).describe("Tipo de dato real de base de datos."),
  length: z
    .string()
    .optional()
    .describe("Longitud o precisión cuando aplique, ej: '10,2' para DECIMAL, '20' para VARCHAR. Vacío si no aplica."),
  nullable: z.boolean().describe("Si el campo admite valores nulos."),
  key: z.enum(["PK", "FK", "NONE"]).describe("PK si es llave primaria, FK si es llave foránea, NONE si no es llave."),
  keyTarget: z
    .string()
    .optional()
    .describe("Si key es FK, el nombre de la entidad a la que apunta. Vacío en otro caso."),
  description: z.string().describe("Descripción y restricciones, ej: 'Debe ser mayor a 0', 'Valores permitidos: pendiente, pagada'."),
});

const DataRelationSchema = z.object({
  cardinality: z.enum(["1:1", "1:N", "N:1", "N:M"]).describe("Cardinalidad de la relación."),
  target: z.string().describe("Nombre de la entidad relacionada."),
  description: z.string().describe("Descripción de la relación en una frase, ej: 'Un cliente puede tener muchas facturas'."),
});

export const DataModelEntitySchema = z.object({
  name: z.string().describe("Nombre de la entidad en PascalCase, ej: 'Factura'."),
  fields: z.array(DataFieldSchema).min(1).describe("El diccionario de datos completo de la entidad, atributo por atributo."),
  relations: z.array(DataRelationSchema).describe("Vacío si la entidad no tiene relaciones."),
});

export const ApiEndpointSchema = z.object({
  method: z.enum(["GET", "POST", "PATCH", "PUT", "DELETE"]),
  path: z.string().describe("Ej: /facturas/:id"),
  description: z.string(),
});

export const DataModelAndApiSchema = z.object({
  entities: z.array(DataModelEntitySchema).min(1),
  endpoints: z.array(ApiEndpointSchema).min(1),
});

export type DataModelEntityDraft = z.infer<typeof DataModelEntitySchema>;
export type ApiEndpointDraft = z.infer<typeof ApiEndpointSchema>;

const SYSTEM_PROMPT_BASE = `Eres un arquitecto de datos senior. Un modelo de
datos "perfeccionado" no es solo un diagrama — es el diagrama
entidad-relación MÁS el diccionario de datos que explica cada campo. Sin el
diccionario, el diagrama es decorativo: un desarrollador no debería tener
que adivinar el tipo, la longitud o las restricciones de ningún atributo.

A partir de los requerimientos y las historias de usuario de un proyecto:

1. Documenta cada entidad con su diccionario de datos completo: cada
   atributo necesita un tipo de dato real (INTEGER, DECIMAL, VARCHAR, TEXT,
   BOOLEAN, DATE, TIMESTAMP, UUID o ENUM — nunca tipos vagos como "string"
   o "number"), longitud/precisión cuando aplique (ej. DECIMAL necesita
   algo como "10,2"; VARCHAR necesita una longitud), si admite nulos, si es
   PK o FK (con el nombre de la entidad destino), y una descripción con
   las restricciones reales (rangos, valores permitidos, reglas).
2. Toda entidad tiene exactamente una PK (normalmente 'id', INTEGER o
   UUID). Toda relación 1:N se implementa como una FK en el lado "N".
3. Documenta cada relación con su cardinalidad exacta (1:1, 1:N, N:1, N:M)
   — una relación N:M SIEMPRE se resuelve con una entidad intermedia
   explícita en la lista de entidades, nunca se deja implícita.
4. Normaliza hasta la tercera forma normal (3FN) como mínimo: cada
   atributo depende únicamente de la clave primaria completa, sin
   dependencias transitivas — por ejemplo, el nombre de un cliente no se
   repite en la tabla de facturas, vive solo en la entidad Cliente y se
   conecta por FK.
5. Propón una API REST (método, path, descripción) que cubra las
   operaciones necesarias para soportar las historias de usuario, y sé
   consistente: si el modelo de datos tiene una entidad "Factura", la API
   tiene endpoints sobre /facturas.
6. Cero ambigüedad: todo campo ENUM o de categoría lista en su descripción
   los valores exactos permitidos (nunca "estado del pedido" solo, sino
   "Valores permitidos: pendiente, pagado, cancelado"); todo VARCHAR trae
   una longitud numérica concreta, nunca "variable" o "según necesidad"; y
   toda restricción de rango va con el número exacto (ej. "debe ser mayor a
   0", nunca "debe ser un valor razonable").`;

export async function runDataModelStage(
  claude: ClaudeClient,
  params: {
    requirements: { code: string; title: string; description: string }[];
    stories: { actor: string; goal: string; benefit: string }[];
    domainGuidance: string;
  },
) {
  const prompt = `Requerimientos:\n${params.requirements
    .map((r) => `${r.code}: ${r.title} — ${r.description}`)
    .join("\n")}\n\nHistorias de usuario:\n${params.stories
    .map((s) => formatUserStorySentence(s.actor, s.goal, s.benefit))
    .join("\n")}`;

  return claude.generateStructured({
    system: `${SYSTEM_PROMPT_BASE}\n\n${params.domainGuidance}`,
    prompt,
    schema: DataModelAndApiSchema,
    schemaName: "data_model_and_api",
    maxTokens: 40000,
  });
}
