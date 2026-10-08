---
name: tracabilite
description: Formats imposés de PROJECT_LOG.md, MEMORY/STATE.md, MEMORY/INDEX.md et MEMORY/features/<F-id>.md, et moments où les écrire. À charger en fin de feature, avant une opération longue ou quand le contexte va être compacté.
---

# Traçabilité

## Règles critiques

- Une information vit à un seul endroit ; les autres fichiers citent son identifiant (`F-012`, `D-004`, `ADR-0007`).
- Une dette reçoit son `D-xxx` au moment où elle est créée, entre dans `PROJECT_LOG.md` et reste dans `STATE.md` jusqu'à résorption.
- `MEMORY/gates.log` est écrit par le socle, jamais à la main.
- `STATE.md` se réécrit en entier, reste sous 10 000 caractères, et laisse une ligne vide après chaque titre.
- Sauvegarde complète (STATE + PROJECT_LOG + INDEX) : fin de feature, avant opération longue, annonce de compactage, après une escalade, ou en cas de doute.

## PROJECT_LOG.md (une entrée par feature, fix, dette, refactor)

```markdown
## [DATE] F-012 <titre>

- TYPE: FEATURE | FIX | DEBT | REFACTOR | SECURITY
- Tier: trivial | standard | structurel
- Scope: <module> — agents: <ids> — commits: <premier>..<dernier>
- Détail: <quoi>
- Dette: introduite D-00x / résorbée D-00y / aucune
- ADR: ADR-00xx | aucun
- Tests: <ajoutés/adaptés> — état: verts | UNVERIFIED — preuve: checks.txt | dev
- Gates: SECURITY <état> · ARCHITECTURE <état> · CRAFT <état> · revue <route A | route B | NON INDÉPENDANTE>
- Mesures: boucles <n par gate> · constats confirmés <n par gate> · faux positifs <n> · coût ≈ <si connu>
```

## MEMORY/STATE.md

```markdown
# STATE — notionLike — <date>

## Où on en est

<2–5 lignes : dernière feature DONE, feature en cours, tier>

## Prochaine action prévue

<une ligne précise, reprenable telle quelle>

## Dettes ouvertes

- D-004 <titre> — depuis F-009 — impact: ...

## État des contrôles / gates

<RESULTAT du dernier checks.txt — UNVERIFIED (commandes à lancer) — derniers verdicts>

## Pièges actifs

<ce qu'un nouvel agent doit savoir pour ne pas casser quelque chose>
```

## MEMORY/features/<F-id>.md (écrit une fois, en fin de feature)

```markdown
# MEMORY: F-012 <titre>

- Date / commits
- Spec (lien) et ce qui a été livré
- Décisions : liens vers les ADR
- Architecture touchée
- Dette laissée (id D-xxx)
- Pièges / points de vigilance
```

## MEMORY/INDEX.md

Une ligne par feature : `- F-012 <titre> — <date> — features/F-012.md`. Au-delà de ~50 lignes, résumer les plus anciennes en un bloc « Historique < date ».
