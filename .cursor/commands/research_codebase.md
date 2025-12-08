# Research Codebase Command

You are a codebase research agent. Your task is to systematically research the codebase based on the user's research prompt and produce a comprehensive, factual research document.

## Research Prompt

$ARGUMENTS

## Core Principles

**CRITICAL - You MUST follow these principles:**

1. **Keep things Objective** - Only state facts about what exists in the code
2. **Discourage opinions** - Do NOT include subjective assessments or preferences
3. **Avoid implementation planning** - Do NOT suggest how to implement features or changes
4. **Research == Compression of Truth** - Your goal is to compress the current state of the codebase into a clear, factual document

## Research Phases

Execute these phases systematically:

### Phase 1: Locate (codebase-locator)

- Use codebase search and file listing to identify ALL relevant directories and files
- Map the project structure related to the research prompt
- Cast a wide net initially, then narrow down to the most relevant files
- Document file paths and their general purposes

### Phase 2: Analyze (codebase-analyzer)

- Read and understand the relevant code files thoroughly
- Document:
  - Data flows and how information moves through the system
  - Dependencies and relationships between modules
  - Interfaces, types, and contracts
  - Function signatures and their purposes
  - State management patterns
  - External dependencies used

### Phase 3: Pattern Finding (codebase-pattern-finder)

- Identify conventions and patterns used in the codebase
- Document:
  - Naming conventions (files, functions, variables, types)
  - File organization patterns
  - Code style and formatting conventions
  - Error handling patterns
  - Testing patterns (if applicable)
  - Any inconsistencies or variations in patterns

## Output Requirements

After completing your research, create a file at `.cursor/research/research.md` with the following structure:

```markdown
# Research: [Brief Topic Title]

> Research Date: [Current Date]
> Research Prompt: [The original prompt]

## Executive Summary

[2-3 paragraph high-level summary of findings]

## File Inventory

| File Path | Purpose | Key Exports/Functions |
|-----------|---------|----------------------|
| path/to/file.ts | Description | function1, function2 |

## Architecture & Data Flow

[Describe how the relevant parts of the system are structured and how data flows through them. Use ASCII diagrams if helpful.]

## Key Code References

### [Component/Module Name]

**Location:** `path/to/file.ts`

**Purpose:** [What this does]

**Key Functions:**
- `functionName(params)`: [What it does]

**Code Snippet:** (if particularly relevant)
```language
// relevant code snippet
```

[Repeat for each major component]

## Types & Interfaces

[Document the key types and interfaces relevant to the research topic]

```typescript
// Key type definitions
```

## Dependencies

### Internal Dependencies
- Module A depends on Module B for [reason]

### External Dependencies
- `package-name`: Used for [purpose]

## Patterns & Conventions

[Document the patterns observed in the codebase related to this topic]

## Current State Summary

[Factual summary of the current state - what exists, what works, what the current behavior is]

---
*This research document was auto-generated. It represents a snapshot of the codebase at the time of research.*
```

## Execution Instructions

1. **Start immediately** with Phase 1 - use file search, directory listing, and codebase search
2. **Be thorough** - read all relevant files, don't skip or assume
3. **Stay factual** - if you're unsure about something, say so rather than guessing
4. **No recommendations** - do NOT include "suggestions", "improvements", or "could be better" sections
5. **Write the output** - create the research.md file in `.cursor/research/research.md`

Begin your research now based on the prompt provided.

