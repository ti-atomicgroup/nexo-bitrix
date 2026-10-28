import "server-only";
import type { ActivityDTO, JourneyDTO, JourneyPreviewDTO } from "@/shared/contracts";
import type { ActivityActionInput, CreateJourneyInput, JourneyActionInput, LinkPersonInput } from "@/shared/schemas";
import { applyActivityAction, applyJourneyAction, createJourney, inviteJourneyPerson, linkJourneyPerson, previewJourney, type Actor } from "@/server/engine";
import { getActivity } from "../db/repos/activities";
import { getJourney } from "../db/repos/journeys";
import { activityNotFound, buildActivityDTOById, buildJourneyDTO, journeyNotFound } from "./read/journeys";

/** Ações sobre jornadas e atividades: o motor grava e enfileira; a resposta é relida do SQLite. */

export function journeyPreview(input: CreateJourneyInput): JourneyPreviewDTO {
  return previewJourney(input);
}

export function startJourney(input: CreateJourneyInput, actor: Actor): { id: string } {
  const { id } = createJourney(input, actor);
  return { id };
}

function requireJourney(id: string): void {
  if (!getJourney(id)) throw journeyNotFound();
}

export function runJourneyAction(id: string, input: JourneyActionInput, actor: Actor): JourneyDTO {
  requireJourney(id);
  applyJourneyAction(id, input, actor);
  return buildJourneyDTO(id);
}

export function linkPerson(id: string, input: LinkPersonInput, actor: Actor): JourneyDTO {
  requireJourney(id);
  if ("inviteEmail" in input) inviteJourneyPerson(id, input.inviteEmail, actor);
  else linkJourneyPerson(id, input.bitrixUserId, actor);
  return buildJourneyDTO(id);
}

export function runActivityAction(id: string, input: ActivityActionInput, actor: Actor): ActivityDTO {
  if (!getActivity(id)) throw activityNotFound();
  applyActivityAction(id, input, actor);
  return buildActivityDTOById(id);
}
