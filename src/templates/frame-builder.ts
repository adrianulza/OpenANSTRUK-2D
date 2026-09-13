/**
 * Parametric frame model builder.
 *
 * Pure domain code, extracted from `frame-template-modal.tsx` so the modal file
 * exports only components — a non-component export from a `.tsx` breaks React
 * Fast Refresh (`react-refresh/only-export-components`) and makes the builder
 * awkward to reach from scripts, which would otherwise have to pull React and
 * every icon through with it.
 *
 * The modal imports `FrameType` and `buildFrameModel` from here; behaviour is
 * unchanged.
 */

import type { StructureModel } from "@/lib/model"
import { newNodeId, newMemberId, defaultSections, resetIdCounter } from "@/lib/model"

export type FrameType =
  | "portal"
  | "diagonal-left"
  | "diagonal-right"
  | "x"
  | "v"
  | "inverted-v"

export function buildFrameModel(
  numStories: number,
  numBays: number,
  storyHeight: number,
  bayWidth: number,
  section: string,
  supportType: "fixed" | "pin",
  frameType: FrameType
): StructureModel {
  resetIdCounter()
  const startX = -(numBays * bayWidth) / 2
  const startY = -(numStories * storyHeight) / 2

  // Primary grid: column intersection nodes
  const grid: string[][] = Array.from({ length: numStories + 1 }, () =>
    new Array(numBays + 1).fill("")
  )
  const nodes: StructureModel["nodes"] = {}

  for (let row = 0; row <= numStories; row++) {
    for (let col = 0; col <= numBays; col++) {
      const id = newNodeId()
      grid[row][col] = id
      nodes[id] = { id, x: startX + col * bayWidth, y: startY + row * storyHeight }
    }
  }

  const members: StructureModel["members"] = {}

  // Columns — identical for all frame types
  for (let col = 0; col <= numBays; col++) {
    for (let row = 0; row < numStories; row++) {
      const id = newMemberId()
      members[id] = { id, a: grid[row][col], b: grid[row + 1][col], section }
    }
  }

  if (frameType === "v") {
    // V brace: apex mid-node sits on the UPPER beam of each story.
    // Braces rise from both lower column nodes to the apex.
    // The upper beam is split left-half + right-half through the apex node.
    for (let story = 0; story < numStories; story++) {
      const upper = story + 1
      for (let bay = 0; bay < numBays; bay++) {
        const midId = newNodeId()
        nodes[midId] = {
          id: midId,
          x: startX + (bay + 0.5) * bayWidth,
          y: startY + upper * storyHeight,
        }
        // Split upper beam through apex
        const mL = newMemberId(), mR = newMemberId()
        members[mL] = { id: mL, a: grid[upper][bay], b: midId, section }
        members[mR] = { id: mR, a: midId, b: grid[upper][bay + 1], section }
        // Brace members from lower corners to apex
        const bL = newMemberId(), bR = newMemberId()
        members[bL] = { id: bL, a: grid[story][bay], b: midId, section }
        members[bR] = { id: bR, a: grid[story][bay + 1], b: midId, section }
      }
    }
  } else if (frameType === "inverted-v") {
    // Inverted-V: apex mid-node sits on the LOWER boundary of each story.
    // For the base story the "lower beam" is a grade beam added at ground level.
    // Braces descend from both upper column nodes to the apex.
    // The lower beam (or grade beam) is split through the apex node.
    for (let story = 0; story < numStories; story++) {
      const lower = story
      const upper = story + 1
      for (let bay = 0; bay < numBays; bay++) {
        const midId = newNodeId()
        nodes[midId] = {
          id: midId,
          x: startX + (bay + 0.5) * bayWidth,
          y: startY + lower * storyHeight,
        }
        // Split lower beam (ground beam for story=0, floor beam for story>0)
        const mL = newMemberId(), mR = newMemberId()
        members[mL] = { id: mL, a: grid[lower][bay], b: midId, section }
        members[mR] = { id: mR, a: midId, b: grid[lower][bay + 1], section }
        // Brace members from upper corners to apex
        const bL = newMemberId(), bR = newMemberId()
        members[bL] = { id: bL, a: grid[upper][bay], b: midId, section }
        members[bR] = { id: bR, a: grid[upper][bay + 1], b: midId, section }
      }
    }
    // Roof beam (top level is never a "lower boundary" — add it as a full beam)
    for (let col = 0; col < numBays; col++) {
      const id = newMemberId()
      members[id] = { id, a: grid[numStories][col], b: grid[numStories][col + 1], section }
    }
  } else {
    // Portal, diagonal-left, diagonal-right, x
    // Standard full beams at every floor level
    for (let row = 1; row <= numStories; row++) {
      for (let col = 0; col < numBays; col++) {
        const id = newMemberId()
        members[id] = { id, a: grid[row][col], b: grid[row][col + 1], section }
      }
    }
    // Diagonal braces
    for (let row = 0; row < numStories; row++) {
      for (let col = 0; col < numBays; col++) {
        if (frameType === "diagonal-right" || frameType === "x") {
          const id = newMemberId()
          members[id] = { id, a: grid[row][col], b: grid[row + 1][col + 1], section }
        }
        if (frameType === "diagonal-left" || frameType === "x") {
          const id = newMemberId()
          members[id] = { id, a: grid[row][col + 1], b: grid[row + 1][col], section }
        }
      }
    }
  }

  const supports: StructureModel["supports"] = {}
  for (let col = 0; col <= numBays; col++) {
    const nodeId = grid[0][col]
    supports[nodeId] = { nodeId, type: supportType }
  }

  return { nodes, members, supports, sections: { ...defaultSections }, loads: {} }
}
