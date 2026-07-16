# Time Clock vs TimeSheetStandard CSV — Reconciliation
Date run: 2026-06-29 · Period covered: Jun 16–29, 2026 · CSV rows: 171 · Employees: 32

## Bottom line
**No backfill needed.** Every employee+date in the CSV already exists in `time_clock`.
Where the two disagree, the app is the cleaner record — the CSV should NOT be written over it.

## Missing from app
None. 0 gaps.

## CSV clock-OUT is broken, app is correct (no action)
These CSV rows logged out == in ("24:00 hours"); app has the real punch-out.
| Employee | Date | CSV in/out | App in/out |
|---|---|---|---|
| Alejandro Araujo Andrade | 06-19 | 8:03/8:03 | 08:03/17:00 |
| Alonso Landeros Marquez | 06-16 | 6:51/6:51 | 06:47/17:51 |
| Angelina Elizabeth Perez Zepeda | 06-23 | 6:56/6:56 | 06:56/18:00 |
| Carlos Alberto Farfan Navarro | 06-16 | 7:25/7:25 | 07:24/17:23 |
| Carlos Pedro Guijarro | 06-26 | 6:55/6:55 | 06:58/08:30 |
| Francisco Javier Muñoz Caballero | 06-18 | 6:44/6:44 | 06:41/18:00 |
| Francisco Javier Muñoz Caballero | 06-19 | 7:01/7:01 | 07:01/18:00 |
| Jesse Vazquez Magaña | 06-19 | 7:01/7:01 | 07:01/19:00 |
| Jorge Luis Ibanez Sanchez | 06-19 | 8:09/8:09 | 08:08/17:00 |
| Jorge Padilla Delgado | 06-19 | 7:06/7:06 | 07:07/19:00 |
| Jorge Padilla Delgado | 06-20 | 9:23/9:23 | 09:04/18:54 |
| Luis Angel Martinez Gonzalez | 06-22 | 8:00/8:00 | 08:01/16:58 |
| Santiago (Jacob Miller) Jiménez Valenzuela | 06-24 | 6:57/6:57 | 06:57/18:00 |

## CSV time differs materially from app (app looks correct in each)
| Field | Employee | Date | CSV | App |
|---|---|---|---|---|
| in | Marisol Yareni Monroy Comparan | 06-17 | 1:13pm | 8:01am |
| in | Marisol Yareni Monroy Comparan | 06-23 | 12:10pm | 8:04am |
| in | Fernando Gutierrez | 06-28 | 10:16am | 6:56am |
| in | Armando Vazquez Magaña | 06-28 | 9:29am | 6:54am |
| in | Glenn Espinosa Ladron De Guevara | 06-22 | 8:42am | 7:00am |
| out | Francisco Javier Muñoz Caballero | 06-17 | 6:44am | 6:00pm |
| out | Glenn Espinosa Ladron De Guevara | 06-23 | 6:50am | 6:00pm |
| out | Glenn Espinosa Ladron De Guevara | 06-17 | 7:04am | 5:55pm |
| out | Lucia Madeleine Castellanos Ascencio | 06-24 | 8:20am | 5:00pm |
| out | Ivana Herkommer Farias | 06-24 | 9:43am | 5:01pm |
| out | Juan Luis Garcia Rincon | 06-16 | 6:00pm | 5:00pm |
| out | Mariana Guadalupe Perez Jimenez | 06-26 | 5:00pm | 6:00pm |

(Small <20-min in-time differences on a few other rows are rounding noise and not listed.)

## Open shifts on 06-29 (today) — normal, not gaps
Alejandro Araujo, Cesar Cardenas, Deysi Esperanza, Glenn Espinosa, Jose A. Hernandez,
Jose C. Bermudez Ham, Mariana Perez, Marisol, Santiago (Jacob Miller), Sebastian Muñoz —
all still clocked in because the day isn't over.

## Note
3 CSV names are terminated/resigned employees (Angelina Perez, Jesse Vazquez, Julia Nuñez)
who still appear in the external system but worked partial days early in the period. Their
app rows already exist for the days they worked.
