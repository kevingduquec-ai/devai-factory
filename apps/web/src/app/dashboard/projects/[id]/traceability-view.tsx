"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import type { RequirementDto, TestCaseDto, TestCaseType, UserStoryDto } from "@devai-factory/shared-types";
import { TEST_CASE_TYPE_LABEL_ES, REQUIREMENT_PRIORITY_LABEL_ES, cleanUserStoryParts } from "@devai-factory/shared-types";
import { Spinner } from "@/components/spinner";
import { Card, CardBadge } from "@/components/ui/card";
import { Select, Textarea } from "@/components/ui/input";
import { Button } from "@/components/ui/button";

export function TraceabilityView({
  requirements,
  stories,
  testCases,
}: {
  requirements: RequirementDto[];
  stories: UserStoryDto[];
  testCases: TestCaseDto[];
}) {
  const storiesByRequirement = new Map<string, UserStoryDto[]>();
  for (const story of stories) {
    const list = storiesByRequirement.get(story.requirementId) ?? [];
    list.push(story);
    storiesByRequirement.set(story.requirementId, list);
  }

  const testCasesByCriterion = new Map<string, TestCaseDto[]>();
  for (const tc of testCases) {
    const list = testCasesByCriterion.get(tc.acceptanceCriteriaId) ?? [];
    list.push(tc);
    testCasesByCriterion.set(tc.acceptanceCriteriaId, list);
  }

  return (
    <div className="space-y-4">
      {requirements.map((req) => {
        const reqStories = storiesByRequirement.get(req.id) ?? [];
        return (
          <Card key={req.id}>
            <p className="font-accent text-xs text-muted">{req.code}</p>
            <p className="font-accent font-medium">{req.title}</p>

            {reqStories.length === 0 ? (
              <p className="mt-2 text-xs text-muted">Sin historia de usuario asociada.</p>
            ) : (
              <div className="mt-3 space-y-4 border-l-2 border-qubit-gray-100 pl-4 dark:border-white/10">
                {reqStories.map((story) => (
                  <StoryBlock key={story.id} story={story} testCasesByCriterion={testCasesByCriterion} />
                ))}
              </div>
            )}
          </Card>
        );
      })}
    </div>
  );
}

function StoryBlock({
  story,
  testCasesByCriterion,
}: {
  story: UserStoryDto;
  testCasesByCriterion: Map<string, TestCaseDto[]>;
}) {
  const router = useRouter();
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [title, setTitle] = useState(story.title);
  const [actor, setActor] = useState(story.actor);
  const [goal, setGoal] = useState(story.goal);
  const [benefit, setBenefit] = useState(story.benefit);
  const [dor, setDor] = useState(story.definitionOfReady ?? "");
  const [dod, setDod] = useState(story.definitionOfDone ?? "");

  async function patch(data: Record<string, unknown>) {
    setSaving(true);
    await fetch(`/api/user-stories/${story.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(data),
    });
    setSaving(false);
    router.refresh();
  }

  async function save() {
    await patch({ title, actor, goal, benefit, definitionOfReady: dor || undefined, definitionOfDone: dod || undefined });
    setEditing(false);
  }

  return (
    <div>
      <div className="flex items-center justify-between gap-2">
        <p className="font-accent text-xs text-muted">{story.code}</p>
        <div className="flex items-center gap-1.5">
          {saving && <Spinner className="h-3 w-3 text-qubit-blue-400" />}
          {story.priority && <CardBadge tone="blue">{REQUIREMENT_PRIORITY_LABEL_ES[story.priority]}</CardBadge>}
          {story.storyPoints != null && <CardBadge tone="neutral">{story.storyPoints} pts</CardBadge>}
        </div>
      </div>

      {editing ? (
        <div className="mt-1 space-y-2">
          <input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            className="w-full rounded border border-border bg-surface px-2 py-1 text-sm font-medium outline-none focus:border-qubit-blue-400"
          />
          <div className="flex flex-wrap items-center gap-1 text-sm">
            <span>Como</span>
            <input
              value={actor}
              onChange={(e) => setActor(e.target.value)}
              className="rounded border border-border bg-surface px-1.5 py-0.5 text-sm outline-none focus:border-qubit-blue-400"
            />
            <span>, quiero</span>
            <input
              value={goal}
              onChange={(e) => setGoal(e.target.value)}
              className="min-w-40 flex-1 rounded border border-border bg-surface px-1.5 py-0.5 text-sm outline-none focus:border-qubit-blue-400"
            />
            <span>, para</span>
            <input
              value={benefit}
              onChange={(e) => setBenefit(e.target.value)}
              className="min-w-40 flex-1 rounded border border-border bg-surface px-1.5 py-0.5 text-sm outline-none focus:border-qubit-blue-400"
            />
          </div>
          <div className="space-y-1">
            <label className="text-xs font-medium text-muted">Definition of Ready</label>
            <Textarea value={dor} onChange={(e) => setDor(e.target.value)} rows={2} className="text-xs" />
          </div>
          <div className="space-y-1">
            <label className="text-xs font-medium text-muted">Definition of Done</label>
            <Textarea value={dod} onChange={(e) => setDod(e.target.value)} rows={2} className="text-xs" />
          </div>
          <div className="flex items-center gap-2">
            <Button onClick={save} loading={saving} className="text-xs">
              Guardar
            </Button>
            <Button
              variant="secondary"
              onClick={() => {
                setTitle(story.title);
                setActor(story.actor);
                setGoal(story.goal);
                setBenefit(story.benefit);
                setDor(story.definitionOfReady ?? "");
                setDod(story.definitionOfDone ?? "");
                setEditing(false);
              }}
              disabled={saving}
              className="text-xs"
            >
              Cancelar
            </Button>
          </div>
        </div>
      ) : (
        <button className="block w-full text-left" onClick={() => setEditing(true)} title="Haz clic para editar">
          <p className="font-accent text-sm font-medium hover:underline">{story.title}</p>
          <p className="mt-0.5 text-sm text-foreground/80">
            {(() => {
              const clean = cleanUserStoryParts(story.goal, story.benefit);
              return (
                <>
                  Como <span className="font-medium">{story.actor}</span>, quiero {clean.goal}, para {clean.benefit}
                </>
              );
            })()}
          </p>
        </button>
      )}

      <div className="mt-2 space-y-2">
        {story.acceptanceCriteria.map((ac) => (
          <div key={ac.id} className="rounded-md bg-qubit-gray-50 p-2 text-xs dark:bg-white/[.04]">
            <p className="font-accent mb-0.5 font-semibold text-qubit-blue-600 dark:text-qubit-blue-400">
              {ac.scenarioName}
            </p>
            <p>
              <span className="font-medium">DADO</span> {ac.given} <span className="font-medium">CUANDO</span>{" "}
              {ac.when} <span className="font-medium">ENTONCES</span> {ac.then}
            </p>
            {(testCasesByCriterion.get(ac.id) ?? []).length > 0 && (
              <ul className="mt-1 space-y-1">
                {(testCasesByCriterion.get(ac.id) ?? []).map((tc) => (
                  <TestCaseItem key={tc.id} testCase={tc} />
                ))}
              </ul>
            )}
          </div>
        ))}
      </div>

      {(story.definitionOfReady || story.definitionOfDone) && !editing && (
        <div className="mt-2 space-y-0.5 text-xs text-muted">
          {story.definitionOfReady && (
            <p>
              <span className="font-medium">Definition of Ready:</span> {story.definitionOfReady}
            </p>
          )}
          {story.definitionOfDone && (
            <p>
              <span className="font-medium">Definition of Done:</span> {story.definitionOfDone}
            </p>
          )}
        </div>
      )}
    </div>
  );
}

const TEST_CASE_TYPES: TestCaseType[] = ["functional", "negative", "security", "integration", "regression", "performance"];

function TestCaseItem({ testCase }: { testCase: TestCaseDto }) {
  const router = useRouter();
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [type, setType] = useState<TestCaseType>(testCase.type);
  const [expectedResult, setExpectedResult] = useState(testCase.expectedResult);

  async function save() {
    setSaving(true);
    await fetch(`/api/test-cases/${testCase.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ type, expectedResult }),
    });
    setSaving(false);
    setEditing(false);
    router.refresh();
  }

  if (editing) {
    return (
      <li className="space-y-1.5 rounded bg-white/60 p-1.5 dark:bg-black/30">
        <div className="flex items-center gap-1.5">
          <Select value={type} onChange={(e) => setType(e.target.value as TestCaseType)}>
            {TEST_CASE_TYPES.map((t) => (
              <option key={t} value={t}>
                {TEST_CASE_TYPE_LABEL_ES[t]}
              </option>
            ))}
          </Select>
        </div>
        <textarea
          value={expectedResult}
          onChange={(e) => setExpectedResult(e.target.value)}
          rows={2}
          className="w-full rounded border border-border px-1.5 py-1 text-xs outline-none focus:border-qubit-blue-400"
        />
        <div className="flex items-center gap-2">
          <Button onClick={save} loading={saving} className="px-2 py-0.5 text-xs">
            Guardar
          </Button>
          <Button
            variant="secondary"
            onClick={() => {
              setType(testCase.type);
              setExpectedResult(testCase.expectedResult);
              setEditing(false);
            }}
            disabled={saving}
            className="px-2 py-0.5 text-xs"
          >
            Cancelar
          </Button>
        </div>
      </li>
    );
  }

  return (
    <li>
      <button className="text-left text-muted hover:underline" onClick={() => setEditing(true)} title="Haz clic para editar">
        · <span className="font-accent font-medium">{testCase.code}</span> [{TEST_CASE_TYPE_LABEL_ES[testCase.type]}]{" "}
        {testCase.title}
      </button>
    </li>
  );
}
