-- ============================================================
-- TIME CLOCK CORRECTIONS — Week of 2026-05-18 to 2026-05-24
-- Source of truth: external TimeSheetStandard.csv
-- ============================================================

BEGIN;

-- 1) Move Oscar Pedrazzini to SLOC Weekend (his Th-Sat punches match weekend schedule)
UPDATE employees
SET campaign_id = (SELECT id FROM campaigns WHERE name = 'SLOC Weekend' LIMIT 1)
WHERE id = '163ecebf-e75f-40f2-9d81-fc43a6e1aebb';

-- 2) UPDATE 40 time_clock rows — clock_in/clock_out corrected to CSV values
--    (Skipped: Fernando + Rafael Fri 5/22 per your call)

-- Adrian Arechiga Flores — 2026-05-19: 08:25→18:58  =>  07:06→18:59
UPDATE time_clock SET clock_in = '2026-05-19 07:06:00 America/Mexico_City'::timestamptz, clock_out = '2026-05-19 18:59:00 America/Mexico_City'::timestamptz, total_hours = 11.88, lunch_start = NULL, lunch_end = NULL WHERE id = '9bfa4769-acbd-45b5-9972-1aadee9282d7';

-- Adrian Arechiga Flores — 2026-05-20: 07:09→18:58  =>  07:08→19:54
UPDATE time_clock SET clock_in = '2026-05-20 07:08:00 America/Mexico_City'::timestamptz, clock_out = '2026-05-20 19:54:00 America/Mexico_City'::timestamptz, total_hours = 12.77, lunch_start = NULL, lunch_end = NULL WHERE id = '2c7f50a4-39bd-4f4a-a92b-b01ce8cc8a7c';

-- Adrian Castillo Garcia — 2026-05-18: 14:22→17:00  =>  08:42→17:00
UPDATE time_clock SET clock_in = '2026-05-18 08:42:00 America/Mexico_City'::timestamptz, clock_out = '2026-05-18 17:00:00 America/Mexico_City'::timestamptz, total_hours = 8.3, lunch_start = NULL, lunch_end = NULL WHERE id = '025cbb20-18da-4cbd-bf71-a40977e52862';

-- Alejandro Araujo Andrade — 2026-05-18: 14:24→17:00  =>  08:00→17:00
UPDATE time_clock SET clock_in = '2026-05-18 08:00:00 America/Mexico_City'::timestamptz, clock_out = '2026-05-18 17:00:00 America/Mexico_City'::timestamptz, total_hours = 9.0, lunch_start = NULL, lunch_end = NULL WHERE id = 'ca102546-487a-427a-bf3d-fed36eebdfc5';

-- Alonso Landeros Marquez — 2026-05-18: 14:36→16:52  =>  06:50→18:00
UPDATE time_clock SET clock_in = '2026-05-18 06:50:00 America/Mexico_City'::timestamptz, clock_out = '2026-05-18 18:00:00 America/Mexico_City'::timestamptz, total_hours = 11.17, lunch_start = NULL, lunch_end = NULL WHERE id = '6924ca9e-fb6d-4ca0-ba60-7719ace14909';

-- Angelina Elizabeth Perez Zepeda — 2026-05-21: 08:20→18:56  =>  06:59→18:56
UPDATE time_clock SET clock_in = '2026-05-21 06:59:00 America/Mexico_City'::timestamptz, clock_out = '2026-05-21 18:56:00 America/Mexico_City'::timestamptz, total_hours = 11.95, lunch_start = NULL, lunch_end = NULL WHERE id = 'd65f87e8-dac5-45c4-9ebb-4c513b969992';

-- Armando Vazquez Magaña — 2026-05-21: 08:21→18:56  =>  06:51→18:56
UPDATE time_clock SET clock_in = '2026-05-21 06:51:00 America/Mexico_City'::timestamptz, clock_out = '2026-05-21 18:56:00 America/Mexico_City'::timestamptz, total_hours = 12.08, lunch_start = NULL, lunch_end = NULL WHERE id = '9c8a280e-98aa-4691-8e94-d658e4502c80';

-- Carlos Alberto Farfan Navarro — 2026-05-22: 08:44→16:00  =>  07:09→16:00
UPDATE time_clock SET clock_in = '2026-05-22 07:09:00 America/Mexico_City'::timestamptz, clock_out = '2026-05-22 16:00:00 America/Mexico_City'::timestamptz, total_hours = 8.85, lunch_start = NULL, lunch_end = NULL WHERE id = 'c9e1cadf-2044-4f39-9088-fd2f8c6c0a28';

-- Carlos Pedro Guijarro — 2026-05-21: 08:16→18:57  =>  07:03→18:56
UPDATE time_clock SET clock_in = '2026-05-21 07:03:00 America/Mexico_City'::timestamptz, clock_out = '2026-05-21 18:56:00 America/Mexico_City'::timestamptz, total_hours = 11.88, lunch_start = NULL, lunch_end = NULL WHERE id = '2c32fcbb-359e-451f-a751-b4685b83a369';

-- Cesar Arnoldo Soltero Cardenas — 2026-05-20: 11:46→17:31  =>  07:41→17:32
UPDATE time_clock SET clock_in = '2026-05-20 07:41:00 America/Mexico_City'::timestamptz, clock_out = '2026-05-20 17:32:00 America/Mexico_City'::timestamptz, total_hours = 9.85, lunch_start = NULL, lunch_end = NULL WHERE id = '328dd1c2-d8df-4556-bd4b-1b942406bcfc';

-- Cynthia Adriana Ostos Santiago — 2026-05-18: 14:16→17:06  =>  06:50→17:05
UPDATE time_clock SET clock_in = '2026-05-18 06:50:00 America/Mexico_City'::timestamptz, clock_out = '2026-05-18 17:05:00 America/Mexico_City'::timestamptz, total_hours = 10.25, lunch_start = NULL, lunch_end = NULL WHERE id = '989ba7aa-6720-4a33-891d-a10f74a00010';

-- Francisco Javier Muñoz Caballero — 2026-05-18: 14:49→18:55  =>  06:54→18:54
UPDATE time_clock SET clock_in = '2026-05-18 06:54:00 America/Mexico_City'::timestamptz, clock_out = '2026-05-18 18:54:00 America/Mexico_City'::timestamptz, total_hours = 12.0, lunch_start = NULL, lunch_end = NULL WHERE id = 'f62a9aed-3d4d-4d6d-accb-2f200d4b9341';

-- Glenn Espinosa Ladron De Guevara — 2026-05-18: 14:38→15:47  =>  06:59→18:00
UPDATE time_clock SET clock_in = '2026-05-18 06:59:00 America/Mexico_City'::timestamptz, clock_out = '2026-05-18 18:00:00 America/Mexico_City'::timestamptz, total_hours = 11.02, lunch_start = NULL, lunch_end = NULL WHERE id = '0a0728a7-2b3b-4f1e-96ac-930795d9e361';

-- Gustavo Adolfo Medina Herrejon — 2026-05-22: 08:28→18:55  =>  06:49→18:55
UPDATE time_clock SET clock_in = '2026-05-22 06:49:00 America/Mexico_City'::timestamptz, clock_out = '2026-05-22 18:55:00 America/Mexico_City'::timestamptz, total_hours = 12.1, lunch_start = NULL, lunch_end = NULL WHERE id = 'a2401d06-6da1-4648-9a82-108d9cf19d27';

-- Ivana Herkommer Farias — 2026-05-20: 08:01→17:08  =>  08:09→17:08
UPDATE time_clock SET clock_in = '2026-05-20 08:09:00 America/Mexico_City'::timestamptz, clock_out = '2026-05-20 17:08:00 America/Mexico_City'::timestamptz, total_hours = 8.98, lunch_start = NULL, lunch_end = NULL WHERE id = '50f3e2ac-08ad-41f9-aa3c-28222ecf364a';

-- Jesse Vazquez Magaña — 2026-05-21: 08:18→18:56  =>  07:18→18:56
UPDATE time_clock SET clock_in = '2026-05-21 07:18:00 America/Mexico_City'::timestamptz, clock_out = '2026-05-21 18:56:00 America/Mexico_City'::timestamptz, total_hours = 11.63, lunch_start = NULL, lunch_end = NULL WHERE id = 'aa5432bb-41ee-40fd-a8c5-8069f4edb765';

-- Jorge Luis Ibanez Sanchez — 2026-05-18: 14:24→None  =>  07:43→17:00
UPDATE time_clock SET clock_in = '2026-05-18 07:43:00 America/Mexico_City'::timestamptz, clock_out = '2026-05-18 17:00:00 America/Mexico_City'::timestamptz, total_hours = 9.28, lunch_start = NULL, lunch_end = NULL WHERE id = 'c6671907-6a4d-4edf-a302-a261e46e3afa';

-- Jorge Luis Ibanez Sanchez — 2026-05-19: 07:57→None  =>  07:52→17:00
UPDATE time_clock SET clock_in = '2026-05-19 07:52:00 America/Mexico_City'::timestamptz, clock_out = '2026-05-19 17:00:00 America/Mexico_City'::timestamptz, total_hours = 9.13, lunch_start = NULL, lunch_end = NULL WHERE id = '833e0334-55f6-4c51-acb0-a444f20d9e9a';

-- Jorge Luis Ibanez Sanchez — 2026-05-20: 08:27→None  =>  07:56→17:00
UPDATE time_clock SET clock_in = '2026-05-20 07:56:00 America/Mexico_City'::timestamptz, clock_out = '2026-05-20 17:00:00 America/Mexico_City'::timestamptz, total_hours = 9.07, lunch_start = NULL, lunch_end = NULL WHERE id = 'a4a02230-141f-48f0-9dce-016bb9e31bc1';

-- Jorge Luis Ibanez Sanchez — 2026-05-21: 07:56→None  =>  07:52→17:00
UPDATE time_clock SET clock_in = '2026-05-21 07:52:00 America/Mexico_City'::timestamptz, clock_out = '2026-05-21 17:00:00 America/Mexico_City'::timestamptz, total_hours = 9.13, lunch_start = NULL, lunch_end = NULL WHERE id = 'da6458ef-b265-4e7a-9897-e14e789b71de';

-- Jose Antonio Alvarez Flores — 2026-05-21: 08:17→18:56  =>  06:54→19:00
UPDATE time_clock SET clock_in = '2026-05-21 06:54:00 America/Mexico_City'::timestamptz, clock_out = '2026-05-21 19:00:00 America/Mexico_City'::timestamptz, total_hours = 12.1, lunch_start = NULL, lunch_end = NULL WHERE id = 'e4c03273-b263-4225-9374-d50dcfa683f6';

-- Jose Carlos Bermudez Ham — 2026-05-18: 13:47→15:26  =>  07:01→15:28
UPDATE time_clock SET clock_in = '2026-05-18 07:01:00 America/Mexico_City'::timestamptz, clock_out = '2026-05-18 15:28:00 America/Mexico_City'::timestamptz, total_hours = 8.45, lunch_start = NULL, lunch_end = NULL WHERE id = '37cbcd09-506c-41b1-9020-6ed1ed7fcabc';

-- Julia Ariadna Nuñez Vilches — 2026-05-18: 14:27→15:42  =>  08:16→15:41
UPDATE time_clock SET clock_in = '2026-05-18 08:16:00 America/Mexico_City'::timestamptz, clock_out = '2026-05-18 15:41:00 America/Mexico_City'::timestamptz, total_hours = 7.42, lunch_start = NULL, lunch_end = NULL WHERE id = '3e483f5c-0f38-483a-ae1c-bacf406d7acf';

-- Julia Ariadna Nuñez Vilches — 2026-05-20: 08:07→16:01  =>  08:07→17:00
UPDATE time_clock SET clock_in = '2026-05-20 08:07:00 America/Mexico_City'::timestamptz, clock_out = '2026-05-20 17:00:00 America/Mexico_City'::timestamptz, total_hours = 8.88, lunch_start = NULL, lunch_end = NULL WHERE id = '0de53fa3-96f8-4cb6-a460-3ad2c0da8875';

-- Julia Ariadna Nuñez Vilches — 2026-05-21: 08:13→17:01  =>  09:22→17:00
UPDATE time_clock SET clock_in = '2026-05-21 09:22:00 America/Mexico_City'::timestamptz, clock_out = '2026-05-21 17:00:00 America/Mexico_City'::timestamptz, total_hours = 7.63, lunch_start = NULL, lunch_end = NULL WHERE id = 'ed3ab115-b327-42b1-b378-ac4381c2a6f5';

-- Lucia Madeleine Castellanos Ascencio — 2026-05-19: 08:40→17:00  =>  08:00→17:00
UPDATE time_clock SET clock_in = '2026-05-19 08:00:00 America/Mexico_City'::timestamptz, clock_out = '2026-05-19 17:00:00 America/Mexico_City'::timestamptz, total_hours = 9.0, lunch_start = NULL, lunch_end = NULL WHERE id = 'e5e01e3d-6666-468f-8297-0a0f4777ec82';

-- Lydia Noemi Juarez-Gallegos — 2026-05-18: 14:15→16:52  =>  07:54→16:52
UPDATE time_clock SET clock_in = '2026-05-18 07:54:00 America/Mexico_City'::timestamptz, clock_out = '2026-05-18 16:52:00 America/Mexico_City'::timestamptz, total_hours = 8.97, lunch_start = NULL, lunch_end = NULL WHERE id = 'caf2cb58-24e0-4573-b97a-35af20dc0fe3';

-- Lydia Noemi Juarez-Gallegos — 2026-05-19: 08:00→16:55  =>  07:48→16:54
UPDATE time_clock SET clock_in = '2026-05-19 07:48:00 America/Mexico_City'::timestamptz, clock_out = '2026-05-19 16:54:00 America/Mexico_City'::timestamptz, total_hours = 9.1, lunch_start = NULL, lunch_end = NULL WHERE id = '5c14e524-ff2b-4cc7-b0d2-a77aba3ba47e';

-- Mariana Guadalupe Perez Jimenez — 2026-05-19: 08:37→17:16  =>  08:18→17:16
UPDATE time_clock SET clock_in = '2026-05-19 08:18:00 America/Mexico_City'::timestamptz, clock_out = '2026-05-19 17:16:00 America/Mexico_City'::timestamptz, total_hours = 8.97, lunch_start = NULL, lunch_end = NULL WHERE id = '6b036e9f-db8b-440c-8e52-c1c9a84a76f1';

-- Mariana Guadalupe Perez Jimenez — 2026-05-22: 08:14→16:00  =>  08:00→16:00
UPDATE time_clock SET clock_in = '2026-05-22 08:00:00 America/Mexico_City'::timestamptz, clock_out = '2026-05-22 16:00:00 America/Mexico_City'::timestamptz, total_hours = 8.0, lunch_start = NULL, lunch_end = NULL WHERE id = '7c0b0254-842d-459e-a1dd-07d4e7289435';

-- Marisol Yareni Monroy Comparan — 2026-05-19: 08:49→16:58  =>  08:00→16:58
UPDATE time_clock SET clock_in = '2026-05-19 08:00:00 America/Mexico_City'::timestamptz, clock_out = '2026-05-19 16:58:00 America/Mexico_City'::timestamptz, total_hours = 8.97, lunch_start = NULL, lunch_end = NULL WHERE id = 'b7c79d50-97ae-49a6-8523-227781b7c828';

-- Omar Alejandro Navarro Alvarez — 2026-05-18: 14:12→None  =>  06:59→18:57
UPDATE time_clock SET clock_in = '2026-05-18 06:59:00 America/Mexico_City'::timestamptz, clock_out = '2026-05-18 18:57:00 America/Mexico_City'::timestamptz, total_hours = 11.97, lunch_start = NULL, lunch_end = NULL WHERE id = '2ea4dac7-254a-47b5-a25c-3a8e0547f808';

-- Oscar Andres Pedrazzini Herrera — 2026-05-21: 08:35→18:56  =>  07:06→18:56
UPDATE time_clock SET clock_in = '2026-05-21 07:06:00 America/Mexico_City'::timestamptz, clock_out = '2026-05-21 18:56:00 America/Mexico_City'::timestamptz, total_hours = 11.83, lunch_start = NULL, lunch_end = NULL WHERE id = '3f84dc47-c3e5-47b2-8a54-8791ef1bc3a1';

-- Richecarde Lafrance Michel — 2026-05-21: 08:46→18:57  =>  06:40→18:57
UPDATE time_clock SET clock_in = '2026-05-21 06:40:00 America/Mexico_City'::timestamptz, clock_out = '2026-05-21 18:57:00 America/Mexico_City'::timestamptz, total_hours = 12.28, lunch_start = NULL, lunch_end = NULL WHERE id = 'f43aaae1-910a-4cac-be23-448c65cac78e';

-- Santiago Jiménez Valenzuela — 2026-05-18: 14:27→18:59  =>  06:55→18:59
UPDATE time_clock SET clock_in = '2026-05-18 06:55:00 America/Mexico_City'::timestamptz, clock_out = '2026-05-18 18:59:00 America/Mexico_City'::timestamptz, total_hours = 12.07, lunch_start = NULL, lunch_end = NULL WHERE id = '34546520-0874-4fca-95f9-ff9858410559';

-- Sebastian Cordova Castañeda — 2026-05-18: 14:16→16:59  =>  08:25→16:59
UPDATE time_clock SET clock_in = '2026-05-18 08:25:00 America/Mexico_City'::timestamptz, clock_out = '2026-05-18 16:59:00 America/Mexico_City'::timestamptz, total_hours = 8.57, lunch_start = NULL, lunch_end = NULL WHERE id = '098c8104-2c5c-4c73-8063-f21776956047';

-- Sebastian Munoz Villalobos — 2026-05-19: 17:05→18:59  =>  06:51→18:51
UPDATE time_clock SET clock_in = '2026-05-19 06:51:00 America/Mexico_City'::timestamptz, clock_out = '2026-05-19 18:51:00 America/Mexico_City'::timestamptz, total_hours = 12.0, lunch_start = NULL, lunch_end = NULL WHERE id = 'c1f73007-2154-4458-8546-85c800010739';

-- Sofia Corrales Gonzalez — 2026-05-22: 08:26→16:54  =>  08:24→17:00
UPDATE time_clock SET clock_in = '2026-05-22 08:24:00 America/Mexico_City'::timestamptz, clock_out = '2026-05-22 17:00:00 America/Mexico_City'::timestamptz, total_hours = 8.6, lunch_start = NULL, lunch_end = NULL WHERE id = '385a079c-a507-47fb-8a68-d0b9999b37c0';

-- Ubaldo Gonzalez Moran — 2026-05-22: 08:26→16:55  =>  07:42→17:00
UPDATE time_clock SET clock_in = '2026-05-22 07:42:00 America/Mexico_City'::timestamptz, clock_out = '2026-05-22 17:00:00 America/Mexico_City'::timestamptz, total_hours = 9.3, lunch_start = NULL, lunch_end = NULL WHERE id = '7ccc76fb-6699-4785-b072-0c1bd37e042c';

-- Zhenia Cristel Hernández Bravo — 2026-05-22: 08:24→17:00  =>  08:07→17:00
UPDATE time_clock SET clock_in = '2026-05-22 08:07:00 America/Mexico_City'::timestamptz, clock_out = '2026-05-22 17:00:00 America/Mexico_City'::timestamptz, total_hours = 8.88, lunch_start = NULL, lunch_end = NULL WHERE id = '4a643c32-4b23-4adf-a79a-525d0a36ef6f';

-- 3) INSERT 58 missing time_clock rows
--    (Skipped: Ruben Curiel — handled outside the app)

-- Adrian Arechiga Flores — 2026-05-18: 07:09 → 18:57  (11.8h)
INSERT INTO time_clock (employee_id, date, clock_in, clock_out, total_hours, eod_completed) VALUES ('44cbca4a-c0c7-4db4-82cd-f7c669143607', '2026-05-18', '2026-05-18 07:09:00 America/Mexico_City'::timestamptz, '2026-05-18 18:57:00 America/Mexico_City'::timestamptz, 11.8, false);

-- Adrian Arechiga Flores — 2026-05-21: 07:06 → 18:00  (10.9h)
INSERT INTO time_clock (employee_id, date, clock_in, clock_out, total_hours, eod_completed) VALUES ('44cbca4a-c0c7-4db4-82cd-f7c669143607', '2026-05-21', '2026-05-21 07:06:00 America/Mexico_City'::timestamptz, '2026-05-21 18:00:00 America/Mexico_City'::timestamptz, 10.9, false);

-- Aldo Trujillo Guerrero — 2026-05-18: 07:08 → 16:00  (8.87h)
INSERT INTO time_clock (employee_id, date, clock_in, clock_out, total_hours, eod_completed) VALUES ('1d9e3c71-8726-4ca7-9c74-1b18cc805f86', '2026-05-18', '2026-05-18 07:08:00 America/Mexico_City'::timestamptz, '2026-05-18 16:00:00 America/Mexico_City'::timestamptz, 8.87, false);

-- Aldo Trujillo Guerrero — 2026-05-19: 07:05 → 16:01  (8.93h)
INSERT INTO time_clock (employee_id, date, clock_in, clock_out, total_hours, eod_completed) VALUES ('1d9e3c71-8726-4ca7-9c74-1b18cc805f86', '2026-05-19', '2026-05-19 07:05:00 America/Mexico_City'::timestamptz, '2026-05-19 16:01:00 America/Mexico_City'::timestamptz, 8.93, false);

-- Aldo Trujillo Guerrero — 2026-05-20: 07:17 → 16:40  (9.38h)
INSERT INTO time_clock (employee_id, date, clock_in, clock_out, total_hours, eod_completed) VALUES ('1d9e3c71-8726-4ca7-9c74-1b18cc805f86', '2026-05-20', '2026-05-20 07:17:00 America/Mexico_City'::timestamptz, '2026-05-20 16:40:00 America/Mexico_City'::timestamptz, 9.38, false);

-- Aldo Trujillo Guerrero — 2026-05-21: 08:45 → 16:00  (7.25h)
INSERT INTO time_clock (employee_id, date, clock_in, clock_out, total_hours, eod_completed) VALUES ('1d9e3c71-8726-4ca7-9c74-1b18cc805f86', '2026-05-21', '2026-05-21 08:45:00 America/Mexico_City'::timestamptz, '2026-05-21 16:00:00 America/Mexico_City'::timestamptz, 7.25, false);

-- Aldo Trujillo Guerrero — 2026-05-22: 07:06 → 16:00  (8.9h)
INSERT INTO time_clock (employee_id, date, clock_in, clock_out, total_hours, eod_completed) VALUES ('1d9e3c71-8726-4ca7-9c74-1b18cc805f86', '2026-05-22', '2026-05-22 07:06:00 America/Mexico_City'::timestamptz, '2026-05-22 16:00:00 America/Mexico_City'::timestamptz, 8.9, false);

-- Carlos Alberto Farfan Navarro — 2026-05-18: 07:01 → 17:00  (9.98h)
INSERT INTO time_clock (employee_id, date, clock_in, clock_out, total_hours, eod_completed) VALUES ('1d371b9d-6413-4e6c-8bf8-8f504631f44e', '2026-05-18', '2026-05-18 07:01:00 America/Mexico_City'::timestamptz, '2026-05-18 17:00:00 America/Mexico_City'::timestamptz, 9.98, false);

-- Carlos Alberto Farfan Navarro — 2026-05-19: 07:08 → 17:00  (9.87h)
INSERT INTO time_clock (employee_id, date, clock_in, clock_out, total_hours, eod_completed) VALUES ('1d371b9d-6413-4e6c-8bf8-8f504631f44e', '2026-05-19', '2026-05-19 07:08:00 America/Mexico_City'::timestamptz, '2026-05-19 17:00:00 America/Mexico_City'::timestamptz, 9.87, false);

-- Carlos Alberto Farfan Navarro — 2026-05-20: 06:53 → 17:00  (10.12h)
INSERT INTO time_clock (employee_id, date, clock_in, clock_out, total_hours, eod_completed) VALUES ('1d371b9d-6413-4e6c-8bf8-8f504631f44e', '2026-05-20', '2026-05-20 06:53:00 America/Mexico_City'::timestamptz, '2026-05-20 17:00:00 America/Mexico_City'::timestamptz, 10.12, false);

-- Carlos Alberto Farfan Navarro — 2026-05-21: 07:52 → 17:00  (9.13h)
INSERT INTO time_clock (employee_id, date, clock_in, clock_out, total_hours, eod_completed) VALUES ('1d371b9d-6413-4e6c-8bf8-8f504631f44e', '2026-05-21', '2026-05-21 07:52:00 America/Mexico_City'::timestamptz, '2026-05-21 17:00:00 America/Mexico_City'::timestamptz, 9.13, false);

-- Cesar Arnoldo Soltero Cardenas — 2026-05-18: 07:54 → 17:00  (9.1h)
INSERT INTO time_clock (employee_id, date, clock_in, clock_out, total_hours, eod_completed) VALUES ('10597ded-16f6-4921-a759-6d1377b55d89', '2026-05-18', '2026-05-18 07:54:00 America/Mexico_City'::timestamptz, '2026-05-18 17:00:00 America/Mexico_City'::timestamptz, 9.1, false);

-- Cesar Arnoldo Soltero Cardenas — 2026-05-19: 07:40 → 17:21  (9.68h)
INSERT INTO time_clock (employee_id, date, clock_in, clock_out, total_hours, eod_completed) VALUES ('10597ded-16f6-4921-a759-6d1377b55d89', '2026-05-19', '2026-05-19 07:40:00 America/Mexico_City'::timestamptz, '2026-05-19 17:21:00 America/Mexico_City'::timestamptz, 9.68, false);

-- Daniel Adrian Gonzalez Torres — 2026-05-18: 07:09 → 18:57  (11.8h)
INSERT INTO time_clock (employee_id, date, clock_in, clock_out, total_hours, eod_completed) VALUES ('c25cf158-484e-4b55-8c01-ed8ddff38849', '2026-05-18', '2026-05-18 07:09:00 America/Mexico_City'::timestamptz, '2026-05-18 18:57:00 America/Mexico_City'::timestamptz, 11.8, false);

-- Daniel Adrian Gonzalez Torres — 2026-05-19: 07:07 → 18:57  (11.83h)
INSERT INTO time_clock (employee_id, date, clock_in, clock_out, total_hours, eod_completed) VALUES ('c25cf158-484e-4b55-8c01-ed8ddff38849', '2026-05-19', '2026-05-19 07:07:00 America/Mexico_City'::timestamptz, '2026-05-19 18:57:00 America/Mexico_City'::timestamptz, 11.83, false);

-- Daniel Adrian Gonzalez Torres — 2026-05-20: 07:12 → 18:01  (10.82h)
INSERT INTO time_clock (employee_id, date, clock_in, clock_out, total_hours, eod_completed) VALUES ('c25cf158-484e-4b55-8c01-ed8ddff38849', '2026-05-20', '2026-05-20 07:12:00 America/Mexico_City'::timestamptz, '2026-05-20 18:01:00 America/Mexico_City'::timestamptz, 10.82, false);

-- Diego Landeros Marquez — 2026-05-18: 08:00 → 17:00  (9.0h)
INSERT INTO time_clock (employee_id, date, clock_in, clock_out, total_hours, eod_completed) VALUES ('58cf15c3-f595-446f-b427-0eb39935a770', '2026-05-18', '2026-05-18 08:00:00 America/Mexico_City'::timestamptz, '2026-05-18 17:00:00 America/Mexico_City'::timestamptz, 9.0, false);

-- Diego Landeros Marquez — 2026-05-19: 08:33 → 16:58  (8.42h)
INSERT INTO time_clock (employee_id, date, clock_in, clock_out, total_hours, eod_completed) VALUES ('58cf15c3-f595-446f-b427-0eb39935a770', '2026-05-19', '2026-05-19 08:33:00 America/Mexico_City'::timestamptz, '2026-05-19 16:58:00 America/Mexico_City'::timestamptz, 8.42, false);

-- Diego Landeros Marquez — 2026-05-20: 07:59 → 17:00  (9.02h)
INSERT INTO time_clock (employee_id, date, clock_in, clock_out, total_hours, eod_completed) VALUES ('58cf15c3-f595-446f-b427-0eb39935a770', '2026-05-20', '2026-05-20 07:59:00 America/Mexico_City'::timestamptz, '2026-05-20 17:00:00 America/Mexico_City'::timestamptz, 9.02, false);

-- Diego Landeros Marquez — 2026-05-21: 07:53 → 16:55  (9.03h)
INSERT INTO time_clock (employee_id, date, clock_in, clock_out, total_hours, eod_completed) VALUES ('58cf15c3-f595-446f-b427-0eb39935a770', '2026-05-21', '2026-05-21 07:53:00 America/Mexico_City'::timestamptz, '2026-05-21 16:55:00 America/Mexico_City'::timestamptz, 9.03, false);

-- Ivana Herkommer Farias — 2026-05-18: 08:00 → 17:01  (9.02h)
INSERT INTO time_clock (employee_id, date, clock_in, clock_out, total_hours, eod_completed) VALUES ('ece90b60-83c2-4c50-ba8f-4d43e5ef44d4', '2026-05-18', '2026-05-18 08:00:00 America/Mexico_City'::timestamptz, '2026-05-18 17:01:00 America/Mexico_City'::timestamptz, 9.02, false);

-- Jorge Jaaziel Magallon Chanon — 2026-05-18: 10:17 → 18:22  (8.08h)
INSERT INTO time_clock (employee_id, date, clock_in, clock_out, total_hours, eod_completed) VALUES ('8bf0f3fe-00a9-4eaa-a13e-b2664fed1baf', '2026-05-18', '2026-05-18 10:17:00 America/Mexico_City'::timestamptz, '2026-05-18 18:22:00 America/Mexico_City'::timestamptz, 8.08, false);

-- Jorge Jaaziel Magallon Chanon — 2026-05-19: 08:02 → 17:00  (8.97h)
INSERT INTO time_clock (employee_id, date, clock_in, clock_out, total_hours, eod_completed) VALUES ('8bf0f3fe-00a9-4eaa-a13e-b2664fed1baf', '2026-05-19', '2026-05-19 08:02:00 America/Mexico_City'::timestamptz, '2026-05-19 17:00:00 America/Mexico_City'::timestamptz, 8.97, false);

-- Jorge Jaaziel Magallon Chanon — 2026-05-20: 08:02 → 16:59  (8.95h)
INSERT INTO time_clock (employee_id, date, clock_in, clock_out, total_hours, eod_completed) VALUES ('8bf0f3fe-00a9-4eaa-a13e-b2664fed1baf', '2026-05-20', '2026-05-20 08:02:00 America/Mexico_City'::timestamptz, '2026-05-20 16:59:00 America/Mexico_City'::timestamptz, 8.95, false);

-- Jorge Jaaziel Magallon Chanon — 2026-05-22: 08:06 → 17:03  (8.95h)
INSERT INTO time_clock (employee_id, date, clock_in, clock_out, total_hours, eod_completed) VALUES ('8bf0f3fe-00a9-4eaa-a13e-b2664fed1baf', '2026-05-22', '2026-05-22 08:06:00 America/Mexico_City'::timestamptz, '2026-05-22 17:03:00 America/Mexico_City'::timestamptz, 8.95, false);

-- Jorge Luis Ibanez Sanchez — 2026-05-22: 07:48 → 17:00  (9.2h)
INSERT INTO time_clock (employee_id, date, clock_in, clock_out, total_hours, eod_completed) VALUES ('feedf77d-2b47-4c31-875a-57ef65e3b91e', '2026-05-22', '2026-05-22 07:48:00 America/Mexico_City'::timestamptz, '2026-05-22 17:00:00 America/Mexico_City'::timestamptz, 9.2, false);

-- Juan Luis Garcia Rincon — 2026-05-18: 09:45 → 17:00  (7.25h)
INSERT INTO time_clock (employee_id, date, clock_in, clock_out, total_hours, eod_completed) VALUES ('8858f4d7-ba2a-4273-9af1-9f99f41e4c34', '2026-05-18', '2026-05-18 09:45:00 America/Mexico_City'::timestamptz, '2026-05-18 17:00:00 America/Mexico_City'::timestamptz, 7.25, false);

-- Juan Luis Garcia Rincon — 2026-05-19: 08:10 → 17:00  (8.83h)
INSERT INTO time_clock (employee_id, date, clock_in, clock_out, total_hours, eod_completed) VALUES ('8858f4d7-ba2a-4273-9af1-9f99f41e4c34', '2026-05-19', '2026-05-19 08:10:00 America/Mexico_City'::timestamptz, '2026-05-19 17:00:00 America/Mexico_City'::timestamptz, 8.83, false);

-- Juan Luis Garcia Rincon — 2026-05-20: 07:59 → 17:00  (9.02h)
INSERT INTO time_clock (employee_id, date, clock_in, clock_out, total_hours, eod_completed) VALUES ('8858f4d7-ba2a-4273-9af1-9f99f41e4c34', '2026-05-20', '2026-05-20 07:59:00 America/Mexico_City'::timestamptz, '2026-05-20 17:00:00 America/Mexico_City'::timestamptz, 9.02, false);

-- Juan Luis Garcia Rincon — 2026-05-22: 08:12 → 17:00  (8.8h)
INSERT INTO time_clock (employee_id, date, clock_in, clock_out, total_hours, eod_completed) VALUES ('8858f4d7-ba2a-4273-9af1-9f99f41e4c34', '2026-05-22', '2026-05-22 08:12:00 America/Mexico_City'::timestamptz, '2026-05-22 17:00:00 America/Mexico_City'::timestamptz, 8.8, false);

-- Lucia Madeleine Castellanos Ascencio — 2026-05-18: 08:00 → 17:00  (9.0h)
INSERT INTO time_clock (employee_id, date, clock_in, clock_out, total_hours, eod_completed) VALUES ('834790e4-4fa5-44eb-a8d6-d52400134c77', '2026-05-18', '2026-05-18 08:00:00 America/Mexico_City'::timestamptz, '2026-05-18 17:00:00 America/Mexico_City'::timestamptz, 9.0, false);

-- Luis Alberto Jimenez Vieyra — 2026-05-18: 07:07 → 18:57  (11.83h)
INSERT INTO time_clock (employee_id, date, clock_in, clock_out, total_hours, eod_completed) VALUES ('28386e4f-eb39-4427-87e9-543d03a1e9e4', '2026-05-18', '2026-05-18 07:07:00 America/Mexico_City'::timestamptz, '2026-05-18 18:57:00 America/Mexico_City'::timestamptz, 11.83, false);

-- Luis Angel Martinez Gonzalez — 2026-05-23: 08:21 → 17:02  (8.68h)
INSERT INTO time_clock (employee_id, date, clock_in, clock_out, total_hours, eod_completed) VALUES ('f9bb0621-330b-4fab-ab92-9b61251f3e1e', '2026-05-23', '2026-05-23 08:21:00 America/Mexico_City'::timestamptz, '2026-05-23 17:02:00 America/Mexico_City'::timestamptz, 8.68, false);

-- Mariana Guadalupe Perez Jimenez — 2026-05-18: 08:07 → 17:00  (8.88h)
INSERT INTO time_clock (employee_id, date, clock_in, clock_out, total_hours, eod_completed) VALUES ('2b33ac9a-12a9-4881-ae2a-735b9d9d37b3', '2026-05-18', '2026-05-18 08:07:00 America/Mexico_City'::timestamptz, '2026-05-18 17:00:00 America/Mexico_City'::timestamptz, 8.88, false);

-- Marisol Yareni Monroy Comparan — 2026-05-18: 08:09 → 17:00  (8.85h)
INSERT INTO time_clock (employee_id, date, clock_in, clock_out, total_hours, eod_completed) VALUES ('b7e42385-1011-448c-a5df-e2c4cdb44178', '2026-05-18', '2026-05-18 08:09:00 America/Mexico_City'::timestamptz, '2026-05-18 17:00:00 America/Mexico_City'::timestamptz, 8.85, false);

-- Mauro Gomez Poblano — 2026-05-18: 07:00 → 16:00  (9.0h)
INSERT INTO time_clock (employee_id, date, clock_in, clock_out, total_hours, eod_completed) VALUES ('8c272ff3-87b3-4317-898e-983db3b83314', '2026-05-18', '2026-05-18 07:00:00 America/Mexico_City'::timestamptz, '2026-05-18 16:00:00 America/Mexico_City'::timestamptz, 9.0, false);

-- Mauro Gomez Poblano — 2026-05-19: 06:59 → 16:01  (9.03h)
INSERT INTO time_clock (employee_id, date, clock_in, clock_out, total_hours, eod_completed) VALUES ('8c272ff3-87b3-4317-898e-983db3b83314', '2026-05-19', '2026-05-19 06:59:00 America/Mexico_City'::timestamptz, '2026-05-19 16:01:00 America/Mexico_City'::timestamptz, 9.03, false);

-- Mauro Gomez Poblano — 2026-05-20: 07:03 → 16:01  (8.97h)
INSERT INTO time_clock (employee_id, date, clock_in, clock_out, total_hours, eod_completed) VALUES ('8c272ff3-87b3-4317-898e-983db3b83314', '2026-05-20', '2026-05-20 07:03:00 America/Mexico_City'::timestamptz, '2026-05-20 16:01:00 America/Mexico_City'::timestamptz, 8.97, false);

-- Mauro Gomez Poblano — 2026-05-21: 07:10 → 16:00  (8.83h)
INSERT INTO time_clock (employee_id, date, clock_in, clock_out, total_hours, eod_completed) VALUES ('8c272ff3-87b3-4317-898e-983db3b83314', '2026-05-21', '2026-05-21 07:10:00 America/Mexico_City'::timestamptz, '2026-05-21 16:00:00 America/Mexico_City'::timestamptz, 8.83, false);

-- Mauro Gomez Poblano — 2026-05-22: 07:00 → 14:50  (7.83h)
INSERT INTO time_clock (employee_id, date, clock_in, clock_out, total_hours, eod_completed) VALUES ('8c272ff3-87b3-4317-898e-983db3b83314', '2026-05-22', '2026-05-22 07:00:00 America/Mexico_City'::timestamptz, '2026-05-22 14:50:00 America/Mexico_City'::timestamptz, 7.83, false);

-- Omar Alejandro Navarro Alvarez — 2026-05-19: 07:19 → 18:57  (11.63h)
INSERT INTO time_clock (employee_id, date, clock_in, clock_out, total_hours, eod_completed) VALUES ('d5efec55-5184-4eea-827f-f4ef316b171c', '2026-05-19', '2026-05-19 07:19:00 America/Mexico_City'::timestamptz, '2026-05-19 18:57:00 America/Mexico_City'::timestamptz, 11.63, false);

-- Rafael Ignacio Ochoa Gutierrez — 2026-05-18: 07:17 → 16:00  (8.72h)
INSERT INTO time_clock (employee_id, date, clock_in, clock_out, total_hours, eod_completed) VALUES ('a930b6b3-074f-4003-bc02-303f256ac9ba', '2026-05-18', '2026-05-18 07:17:00 America/Mexico_City'::timestamptz, '2026-05-18 16:00:00 America/Mexico_City'::timestamptz, 8.72, false);

-- Rafael Ignacio Ochoa Gutierrez — 2026-05-19: 07:07 → 16:01  (8.9h)
INSERT INTO time_clock (employee_id, date, clock_in, clock_out, total_hours, eod_completed) VALUES ('a930b6b3-074f-4003-bc02-303f256ac9ba', '2026-05-19', '2026-05-19 07:07:00 America/Mexico_City'::timestamptz, '2026-05-19 16:01:00 America/Mexico_City'::timestamptz, 8.9, false);

-- Rafael Ignacio Ochoa Gutierrez — 2026-05-20: 07:23 → 16:02  (8.65h)
INSERT INTO time_clock (employee_id, date, clock_in, clock_out, total_hours, eod_completed) VALUES ('a930b6b3-074f-4003-bc02-303f256ac9ba', '2026-05-20', '2026-05-20 07:23:00 America/Mexico_City'::timestamptz, '2026-05-20 16:02:00 America/Mexico_City'::timestamptz, 8.65, false);

-- Rafael Ignacio Ochoa Gutierrez — 2026-05-21: 07:16 → 16:00  (8.73h)
INSERT INTO time_clock (employee_id, date, clock_in, clock_out, total_hours, eod_completed) VALUES ('a930b6b3-074f-4003-bc02-303f256ac9ba', '2026-05-21', '2026-05-21 07:16:00 America/Mexico_City'::timestamptz, '2026-05-21 16:00:00 America/Mexico_City'::timestamptz, 8.73, false);

-- Rafael Ignacio Ochoa Gutierrez — 2026-05-22: 07:17 → 16:00  (8.72h)
INSERT INTO time_clock (employee_id, date, clock_in, clock_out, total_hours, eod_completed) VALUES ('a930b6b3-074f-4003-bc02-303f256ac9ba', '2026-05-22', '2026-05-22 07:17:00 America/Mexico_City'::timestamptz, '2026-05-22 16:00:00 America/Mexico_City'::timestamptz, 8.72, false);

-- Sofia Corrales Gonzalez — 2026-05-18: 08:21 → 16:58  (8.62h)
INSERT INTO time_clock (employee_id, date, clock_in, clock_out, total_hours, eod_completed) VALUES ('c6e77c61-3f56-4a6d-9860-0a5d37743eed', '2026-05-18', '2026-05-18 08:21:00 America/Mexico_City'::timestamptz, '2026-05-18 16:58:00 America/Mexico_City'::timestamptz, 8.62, false);

-- Sofia Corrales Gonzalez — 2026-05-19: 08:20 → 16:56  (8.6h)
INSERT INTO time_clock (employee_id, date, clock_in, clock_out, total_hours, eod_completed) VALUES ('c6e77c61-3f56-4a6d-9860-0a5d37743eed', '2026-05-19', '2026-05-19 08:20:00 America/Mexico_City'::timestamptz, '2026-05-19 16:56:00 America/Mexico_City'::timestamptz, 8.6, false);

-- Sofia Corrales Gonzalez — 2026-05-20: 08:37 → 16:56  (8.32h)
INSERT INTO time_clock (employee_id, date, clock_in, clock_out, total_hours, eod_completed) VALUES ('c6e77c61-3f56-4a6d-9860-0a5d37743eed', '2026-05-20', '2026-05-20 08:37:00 America/Mexico_City'::timestamptz, '2026-05-20 16:56:00 America/Mexico_City'::timestamptz, 8.32, false);

-- Sofia Corrales Gonzalez — 2026-05-21: 07:58 → 16:55  (8.95h)
INSERT INTO time_clock (employee_id, date, clock_in, clock_out, total_hours, eod_completed) VALUES ('c6e77c61-3f56-4a6d-9860-0a5d37743eed', '2026-05-21', '2026-05-21 07:58:00 America/Mexico_City'::timestamptz, '2026-05-21 16:55:00 America/Mexico_City'::timestamptz, 8.95, false);

-- Ubaldo Gonzalez Moran — 2026-05-18: 07:57 → 17:00  (9.05h)
INSERT INTO time_clock (employee_id, date, clock_in, clock_out, total_hours, eod_completed) VALUES ('273fbe6b-83ef-420a-a6b9-919614e236c9', '2026-05-18', '2026-05-18 07:57:00 America/Mexico_City'::timestamptz, '2026-05-18 17:00:00 America/Mexico_City'::timestamptz, 9.05, false);

-- Ubaldo Gonzalez Moran — 2026-05-19: 07:57 → 16:58  (9.02h)
INSERT INTO time_clock (employee_id, date, clock_in, clock_out, total_hours, eod_completed) VALUES ('273fbe6b-83ef-420a-a6b9-919614e236c9', '2026-05-19', '2026-05-19 07:57:00 America/Mexico_City'::timestamptz, '2026-05-19 16:58:00 America/Mexico_City'::timestamptz, 9.02, false);

-- Ubaldo Gonzalez Moran — 2026-05-20: 07:59 → 16:59  (9.0h)
INSERT INTO time_clock (employee_id, date, clock_in, clock_out, total_hours, eod_completed) VALUES ('273fbe6b-83ef-420a-a6b9-919614e236c9', '2026-05-20', '2026-05-20 07:59:00 America/Mexico_City'::timestamptz, '2026-05-20 16:59:00 America/Mexico_City'::timestamptz, 9.0, false);

-- Ubaldo Gonzalez Moran — 2026-05-21: 07:50 → 17:00  (9.17h)
INSERT INTO time_clock (employee_id, date, clock_in, clock_out, total_hours, eod_completed) VALUES ('273fbe6b-83ef-420a-a6b9-919614e236c9', '2026-05-21', '2026-05-21 07:50:00 America/Mexico_City'::timestamptz, '2026-05-21 17:00:00 America/Mexico_City'::timestamptz, 9.17, false);

-- Zhenia Cristel Hernández Bravo — 2026-05-18: 08:14 → 17:00  (8.77h)
INSERT INTO time_clock (employee_id, date, clock_in, clock_out, total_hours, eod_completed) VALUES ('715450cb-7fa9-4035-85b9-c7ed93513c5c', '2026-05-18', '2026-05-18 08:14:00 America/Mexico_City'::timestamptz, '2026-05-18 17:00:00 America/Mexico_City'::timestamptz, 8.77, false);

-- Zhenia Cristel Hernández Bravo — 2026-05-19: 08:04 → 17:00  (8.93h)
INSERT INTO time_clock (employee_id, date, clock_in, clock_out, total_hours, eod_completed) VALUES ('715450cb-7fa9-4035-85b9-c7ed93513c5c', '2026-05-19', '2026-05-19 08:04:00 America/Mexico_City'::timestamptz, '2026-05-19 17:00:00 America/Mexico_City'::timestamptz, 8.93, false);

-- Zhenia Cristel Hernández Bravo — 2026-05-20: 08:03 → 17:00  (8.95h)
INSERT INTO time_clock (employee_id, date, clock_in, clock_out, total_hours, eod_completed) VALUES ('715450cb-7fa9-4035-85b9-c7ed93513c5c', '2026-05-20', '2026-05-20 08:03:00 America/Mexico_City'::timestamptz, '2026-05-20 17:00:00 America/Mexico_City'::timestamptz, 8.95, false);

-- Zhenia Cristel Hernández Bravo — 2026-05-21: 08:02 → 17:00  (8.97h)
INSERT INTO time_clock (employee_id, date, clock_in, clock_out, total_hours, eod_completed) VALUES ('715450cb-7fa9-4035-85b9-c7ed93513c5c', '2026-05-21', '2026-05-21 08:02:00 America/Mexico_City'::timestamptz, '2026-05-21 17:00:00 America/Mexico_City'::timestamptz, 8.97, false);

-- ============================================================
-- End of corrections
-- ============================================================

-- Review counts before committing:
--   - UPDATE rows expected: 40
--   - INSERT rows expected: 58
--   - Plus 1 UPDATE on employees (Oscar's campaign)

-- COMMIT;  -- uncomment after sanity check