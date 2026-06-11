// Legal boilerplate for carta compromiso + acta administrativa PDF generation.
// Text sourced from docs/document-templates.md (legal-vetted by JOI).
// Placeholders use {field} notation — replaced at render time.

// ── Carta Compromiso ────────────────────────────────────────────────

export const CARTA_OPENING =
  "Por medio de la presente, yo {trabajador_name}, en mi carácter de {puesto}, manifiesto mi compromiso formal de mejorar mi desempeño laboral y acatar los reglamentos de la empresa {company_name} ubicada en {company_address}, atendiendo a los señalamientos realizados.";

export const CARTA_SECOND_PARAGRAPH =
  "Con base en los reportes y evaluaciones emitidos, mismos que se me comunican de manera directa y oportuna. De manera específico, señalando lo siguiente:";

export const CARTA_ACKNOWLEDGMENT =
  "Reconozco y acepto que dichos reportes reflejan áreas de oportunidad relacionadas con mi conducta, desempeño, cumplimiento de funciones y/o apego a los procedimientos internos establecidos por la empresa. En consecuencia, me comprometo de manera expresa a:";

export const CARTA_COMMITMENTS: { bold: string; rest: string }[] = [
  { bold: "Atender y corregir", rest: " las conductas y áreas de mejora señaladas." },
  { bold: "Cumplir puntualmente", rest: " con mis obligaciones laborales y con los lineamientos internos." },
  { bold: "Mantener una actitud profesional", rest: ", respetuosa y colaborativa con mis superiores, compañeros y personal a mi cargo." },
  { bold: "Adoptar las medidas necesarias", rest: " para asegurar que no se reiteren las situaciones que dieron origen a los reportes evaluados." },
];

export const CARTA_EVAL_PERIOD =
  "30 días naturales contados a partir de la firma de la carta compromiso.";

export const CARTA_EVIDENCE =
  "Reportes diarios de producción, informe JOI SLOC Origination, Notas CRM, seguimiento de supervisión y evaluación semanal";

export const CARTA_CLOSING_1 =
  "Asimismo, se me hace saber que la empresa dará seguimiento a mi desempeño conforme a lo establecido en la Ley Federal del Trabajo, y que, de persistir las conductas u omisiones señaladas, la organización podrá aplicar las medidas disciplinarias correspondientes, conforme a la normativa laboral aplicable y a las políticas internas vigentes.";

export const CARTA_CLOSING_2 =
  "Declaro haber leído y entendido el contenido de este documento, y firmo de conformidad para los efectos legales a que haya lugar";

export const CARTA_CLOSING_3_TEMPLATE =
  "Por lo anterior se levanta la presente Carta Compromiso de Mejora Laboral, informándole que la empresa se reserva el derecho de aplicar las sanciones disciplinarias que procedan de conformidad con el Reglamento Interior de Trabajo y la Ley Federal del Trabajo. Asimismo, se le notifica al(a) C. {trabajador_name_lower}, que la presente se integrará a su expediente personal para los efectos conducentes.";

export const CARTA_CLOSING_4_TEMPLATE =
  "Se entrega la presente constancia de hechos, en {company_address}.";

// ── Acta Administrativa ─────────────────────────────────────────────

export const ACTA_OPENING_TEMPLATE =
  "Por medio de la presente, se hace constar que, siendo las {time} horas del día {incident_date_long}, en el domicilio ubicado en Calle Compostela número 1958, Colonia Chapultepec Country, Guadalajara, Jalisco, dentro de las instalaciones de OUTSOURCE CONSULTING GROUP S.A.S. (en adelante, \"LA EMPRESA\"), se procede a levantar la presente acta administrativa al empleado {trabajador_name}. Se encuentran presentes como testigos de asistencia los CC. {witness_1} y {witness_2}, ambos compañeros de trabajo del empleado, así como {supervisor_name}, en su carácter de jefe directo. En este acto, se hace del conocimiento del empleado {trabajador_name} que el motivo de la presente reunión es hacer constar los hechos que se le atribuyen, ocurridos: {incident_day_short}, durante su jornada de trabajo, consistentes en {reason} Para efectos de la presente acta, se tiene a la vista y se incorpora como parte integrante de la misma la constancia de hechos correspondiente, elaborada con base en los reportes recibidos y en las comunicaciones internas de la empresa, misma que se describe a continuación:";

export const ACTA_LEGAL_BOILERPLATE_TEMPLATE =
  "Por lo anterior, el trabajador incurre en el supuesto normativo previsto en el Reglamento Interior de Trabajo, actualizándose además la hipótesis legal contemplada en el LFT artículo 134, fracción I, \"Cumplir las disposiciones de las normas de trabajo que les sean aplicables\"; artículo 134, fracción III, \"Desempeñar el servicio bajo la dirección del patrón o de su representante, a cuya autoridad estarán subordinados en todo lo concerniente al trabajo\"; Reglamento Interior de Trabajo, artículo 18, \"deberá notificarlo a LA EMPRESA con antelación o, a más tardar, dentro de los primeros 15 (quince) minutos posteriores al inicio de su jornada laboral\"; artículo 20, \"el personal deberá reportarse a su jefe inmediato, sin perjuicio de la obligación de justificar sus faltas\"; artículo 21, \"Las faltas de asistencia solo podrán ser justificadas por personal del Instituto Mexicano del Seguro Social\"; artículo 22, \"Cualquier falta que no cuente con justificante médico expedido por el Instituto Mexicano del Seguro Social, que demuestre la absoluta imposibilidad de haberse comunicado o asistido a su trabajo, legalmente se considerará como falta de asistencia injustificada\"; artículo 61, \"Las inasistencias injustificadas generan consecuencias conforme a la LFT\"; artículo 133, fracción IV, \"Acta administrativa\"; artículo 134, fracción III, \"Determinación por escrito circunstanciada de los hechos\"; cláusula primera del contrato individual de trabajo, \"cumplir con las instrucciones de 'LA EMPRESA', su supervisor(a) inmediato(a)\" y \"cualquier otra obligación prevista en el presente contrato, el Reglamento\"; cláusula tercera del contrato individual de trabajo, \"de manera puntual, para el desarrollo del presente proyecto\"; cláusula cuarta del contrato individual de trabajo, \"Todos los empleados tienen la obligación de realizar un registro oficial, en los siguientes momentos de su jornada laboral: · A la hora de su ingreso a labores\" En virtud de lo anterior, se considera que el trabajador ha cometido una FALTA (GRAVE), realizando conductas contrarias a las políticas y normas de la Empresa. Por lo tanto, en este acto el representante legal de OUTSOURCE CONSULTING GROUP SAS, hace del conocimiento del trabajador los hechos que se le atribuyen. Hechos de los cuales \"LA EMPRESA\" tuvo conocimiento el día {incident_day_short}, por personal de la empresa, contando con evidencias de estos, como son registros documentales, testimoniales, así como medios electrónicos y digitales, en términos de lo dispuesto por el artículo 776 de la Ley Federal del Trabajo.";

export const ACTA_AUDIENCIA_TEMPLATE =
  "Por lo anterior se levanta esta Acta Administrativa, solicitando al trabajador(a) {trabajador_name}, se sirva suscribirla y dándole el derecho de audiencia y de manifestar lo que a sus intereses convenga, solicitando al empleado describa con su puño y letra porque motivo incurrió en dicha falta:";

export const ACTA_CLOSING_1 =
  "Por lo anterior se levanta esta Acta Administrativa, informándole que derivado de lo anterior la Empresa se reserva a proceder de conformidad las sanciones disciplinarias establecidas en la Ley y el Reglamento Interior de Trabajo de la Empresa.";

export const ACTA_CLOSING_2_TEMPLATE =
  "Asimismo, se le notifica al empleado(a): {trabajador_name}, que la presente amonestación se integrará a su expediente personal para los efectos conducentes.";

export const ACTA_CLOSING_3_TEMPLATE =
  "Se entrega la presente Acta Administrativa en la calle {company_address}";

export const ACTA_CLOSING_4_TEMPLATE =
  "Se cierra la presente Acta Administrativa siendo las _____:_____ horas del día {incident_date_short}, suscribiéndola quienes participaron en ella.";

// ── Renuncia + Finiquito + Encuesta ─────────────────────────────────

export const RENUNCIA_OPENING =
  'Por este medio quiero presentar mi renuncia voluntaria e irrevocable al puesto de "{puesto}" que he venido desempeñando en esta empresa, siendo efectiva a partir del día de hoy {effective_date}. Tomo esta decisión de manera libre y consciente, por motivos personales y porque así conviene a mis intereses.';

export const RENUNCIA_CLOSING =
  "Agradezco sinceramente la oportunidad que me dieron de trabajar aquí, el buen trato que recibí durante mi tiempo en la empresa, recibir los pagos de mi salario puntualmente, así como todas las prestaciones de ley que me corresponden.";

export const FINIQUITO_BODY_TEMPLATE =
  'Por medio del presente, hago constar que recibo de la empresa "OUTSOURCE CONSULTING GROUP, S.A.S.", la cantidad total de {total_monto} ({total_en_letras}) por concepto de finiquito derivado de mi renuncia voluntaria con fecha al {effective_date}, cantidad que recibo a mi entera satisfacción, mismo que se desglosa de la siguiente manera:';

export const FINIQUITO_LEGAL_BOILERPLATE =
  'Por tal motivo, extiendo el presente recibo de finiquito con el carácter liberatorio más amplio que en derecho proceda, manifestando expresamente que la empresa cubre de manera íntegra y suficiente todas las prestaciones legales generadas durante la vigencia de la relación laboral no me adeuda cantidad alguna por concepto de salarios ordinarios o extraordinarios, aguinaldo, vacaciones, prima vacacional, séptimos días, descansos legales u obligatorios, ni ninguna otra prestación derivada de la relación jurídica que nos unía.\n\nDeclaro que mi salario me fue cubierto en tiempo y forma, durante toda la relación laboral, y que jamás laboré en días de descanso obligatorio, como resultado, no existe adeudo alguno por ese concepto. En virtud de lo anterior, y habiéndoseme cubierto a entera satisfacción todos mis derechos conforme a la Ley Federal del Trabajo, manifiesto que no me reservo acción legal alguna de carácter laboral, civil, mercantil ni penal en contra de "OUTSOURCE CONSULTING GROUP, S.A.S.", ni de sus representantes, socios, apoderados o persona alguna que este o haya estado relacionada con la fuente de trabajo. Firmo el presente documento para constancia y en señal de mi plena conformidad.';

export const ENCUESTA_INTRO =
  'Evaluación de su experiencia durante su estancia laboral. En OUTSOURCE CONSULTING GROUP, S.A.S. agradecemos que haya laborado con nosotros, lamentamos su renuncia y esperamos ser un centro de trabajo de calidad para nuestros colaboradores, por lo que lo invitamos amablemente a que nos apoye con la siguiente encuesta de salida. Por favor, marque con una "X" la opción que mejor refleje su nivel de satisfacción:';

export const ENCUESTA_CATEGORIES: { title: string; questions: string[] }[] = [
  {
    title: "Liderazgo y supervisión",
    questions: [
      "Trato y apoyo por parte de su jefe inmediato",
      "Retroalimentación recibida sobre su desempeño",
      "Claridad de instrucciones por parte de supervisión",
      "Solución oportuna de problemas por parte de sus superiores",
    ],
  },
  {
    title: "Organización del trabajo",
    questions: [
      "Carga de trabajo asignada",
      "Distribución de actividades dentro del área",
      "Herramientas y recursos para desempeñar sus funciones",
      "Planeación y organización de su área de trabajo",
    ],
  },
  {
    title: "Desarrollo laboral",
    questions: [
      "Oportunidades de crecimiento dentro de la empresa",
      "Capacitación recibida para desempeñar su puesto",
      "Reconocimiento a su esfuerzo y resultados",
      "Posibilidad de aprender nuevas habilidades",
    ],
  },
  {
    title: "Condiciones laborales",
    questions: [
      "Prestaciones otorgadas por la empresa",
      "Condiciones de seguridad e higiene en el trabajo",
      "Equilibrio entre vida personal y trabajo",
      "Cumplimiento de horarios, descansos y condiciones pactadas",
    ],
  },
  {
    title: "Cultura y clima laboral",
    questions: [
      "Respeto en el trato dentro de la empresa",
      "Inclusión y sentido de pertenencia",
      "Manejo de conflictos dentro del área",
      "Confianza para expresar inquietudes o inconformidades",
    ],
  },
  {
    title: "Comunicación institucional",
    questions: [
      "Claridad de las políticas internas",
      "Información recibida sobre cambios o decisiones relevantes",
      "Facilidad para acudir a Recursos Humanos o Administración",
      "Atención recibida cuando presentó dudas o necesidades",
    ],
  },
];

export const ENCUESTA_OPEN_QUESTIONS: string[] = [
  "¿Cuál considera que fue la principal razón de su separación de la empresa?",
  "¿Qué considera que la empresa podría mejorar?",
  "¿Qué fue lo que más le agradó de trabajar con nosotros?",
  "¿Desea compartir algún comentario adicional?",
];

export const ENCUESTA_CAUSA_OPTIONS: string[] = [
  "Motivos personales",
  "Mejora salarial",
  "Mejor oportunidad laboral",
  "Problemas de horario",
  "Distancia o traslado",
  "Inconformidad con jefe inmediato",
  "Inconformidad con ambiente laboral",
  "Inconformidad con salario o prestaciones",
  "Falta de crecimiento",
  "Cambio de residencia",
  "Otro: ______________",
];

// ── Rescisión Periodo de Prueba ─────────────────────────────────────

export const RESCISION_TITLE = "AVISO DE RESCISIÓN DE CONTRATO INDIVIDUAL DE TRABAJO";

export const RESCISION_SUBTITLE =
  "Contrato de Periodo de Prueba — Incumplimiento de Indicadores de Desempeño";

export const RESCISION_ANTECEDENTES_TEMPLATE =
  "Con fecha {contract_signing_date_long}, se celebró entre las partes un Contrato Individual de Trabajo por Tiempo Determinado — Periodo de Prueba con vigencia de treinta (30) días naturales, en términos del artículo 39-A de la Ley Federal del Trabajo, con la finalidad de verificar si el trabajador cumple con los requisitos y conocimientos necesarios para el puesto de {puesto}.";

export const RESCISION_ANTECEDENTES_2 =
  "Dicho contrato estableció, en su Cláusula Sexta, los indicadores clave de desempeño (KPIs) que el trabajador debía cumplir como condición para la continuación de la relación laboral, los cuales se detallan en el apartado siguiente.";

export const RESCISION_KPI_INTRO =
  "A continuación se presenta el comparativo entre las métricas contractualmente requeridas y el desempeño registrado durante el periodo de prueba:";

export const RESCISION_KPI_FOOTNOTE =
  "* Los valores de la columna «Registrado» corresponden al promedio semanal documentado en BLB CRM, RingCentral y Origination Tracker durante el periodo comprendido entre el primer y trigésimo día natural de prueba.";

export const RESCISION_FUNDAMENTO_INTRO =
  "La presente rescisión se fundamenta en los siguientes preceptos de la Ley Federal del Trabajo:";

export const RESCISION_FUNDAMENTO_ROWS: { article: string; text: string }[] = [
  {
    article: "Art. 39-A LFT",
    text: "El contrato de prueba podrá celebrarse por un período no mayor de 30 días. Si el trabajador no satisface los requisitos y conocimientos necesarios para desarrollar el trabajo, el patrón podrá rescindir la relación laboral sin responsabilidad.",
  },
  {
    article: "Art. 39-B LFT",
    text: "Los trabajos de capacitación inicial y prueba se regirán por las normas de la Ley Federal del Trabajo. El trabajador gozará de todos los derechos establecidos, incluyendo la seguridad social.",
  },
  {
    article: "Art. 47 LFT Frac. XIV",
    text: "Son causas de rescisión de la relación de trabajo, sin responsabilidad para el patrón, el incumplimiento de las obligaciones a que se refiere el artículo 134 de esta Ley, en especial las fracciones I, X y XI.",
  },
];

export const RESCISION_DECLARACION_TEMPLATE =
  "En virtud de los hechos y fundamentos señalados, OUTSOURCE CONSULTING GROUP S.A.S., por conducto de su representante legal, notifica formalmente al(a la) trabajador(a) la RESCISIÓN DEL CONTRATO INDIVIDUAL DE TRABAJO DE PERIODO DE PRUEBA a partir del día {termination_date_long}, sin responsabilidad para la empresa, de conformidad con los artículos 39-A y 47 de la Ley Federal del Trabajo.";

export const RESCISION_DECLARACION_2 =
  "La presente rescisión obedece exclusivamente al incumplimiento de los indicadores de desempeño pactados contractualmente, sin que medie causal alguna de discriminación, represalia o violación a derechos laborales.";

export const RESCISION_LIQUIDACION_INTRO =
  "La empresa se compromete a cubrir al trabajador(a), dentro del plazo legal, los conceptos que correspondan conforme a ley:";

export const RESCISION_LIQUIDACION_BULLETS: string[] = [
  "Salario devengado hasta la fecha efectiva de rescisión (proporcional).",
  "Parte proporcional de días de descanso obligatorio (art. 74 LFT).",
  "Parte proporcional de vacaciones y prima vacacional (arts. 76–80 LFT).",
  "Parte proporcional de aguinaldo (art. 87 LFT).",
  "Devolución de documentos originales y constancia de trabajo (art. 132, frac. XIII LFT).",
  "Entrega de comprobantes de afiliación al IMSS y baja correspondiente.",
];

export const RESCISION_NO_INDEMNIZACION =
  "El trabajador no generará derecho a indemnización constitucional (art. 50 LFT) ni a prima de antigüedad (art. 162 LFT) en virtud de la naturaleza del contrato rescindido (período de prueba — art. 39-A LFT).";

export const RESCISION_CONSTANCIA_INTRO =
  "El(La) trabajador(a) abajo firmante declara haber recibido copia de la presente notificación y estar en conocimiento de su contenido:";

export const RESCISION_LEGAL_REP_NAME = "DIOMEDES SANDOVAL ROJAS";
export const RESCISION_LEGAL_REP_TITLE = "Representante Legal · Outsource Consulting Group";

// ── Rescisión por Bajo Desempeño (Art. 47 Frac. XI) ─────────────────
// Post-probation termination: employee passed the 30-day prueba, continued on
// a fixed-term contract (por tiempo determinado / campaign duration), and is
// terminated for sustained KPI failure. Different legal grounds from the
// probation rescisión above (Art. 39-A).

export const RESCISION_DESEMPENO_TITLE = "AVISO DE RESCISIÓN DE CONTRATO DE TRABAJO";

export const RESCISION_DESEMPENO_SUBTITLE =
  "Rescisión sin responsabilidad para el patrón — Incumplimiento de Indicadores de Desempeño";

export const RESCISION_DESEMPENO_ANTECEDENTES_1_TEMPLATE =
  "Con fecha {hire_date_long}, el(la) trabajador(a) ingresó a {company_name} bajo un Contrato Individual de Trabajo por Tiempo Determinado — Capacitación Inicial, conforme al artículo 39-B de la Ley Federal del Trabajo.";

export const RESCISION_DESEMPENO_ANTECEDENTES_2_TEMPLATE =
  "Habiendo superado el periodo de capacitación inicial, a partir del día {contract_signing_date_long} la relación laboral continuó bajo un Contrato Individual de Trabajo por Tiempo Determinado (dada la duración de la campaña), asignándole las mismas funciones y los mismos indicadores de desempeño (KPIs) establecidos en la Cláusula Sexta del contrato original.";

export const RESCISION_DESEMPENO_ANTECEDENTES_3_TEMPLATE =
  "Durante el seguimiento posterior al periodo de capacitación inicial y en base a las evaluaciones realizadas, la empresa verificó que el(la) trabajador(a) mantuvo un desempeño por debajo de los indicadores mínimos requeridos, conforme consta en los registros de la campaña {campaign}, constituyendo incumplimiento a las obligaciones pactadas en el contrato de trabajo.";

export const RESCISION_DESEMPENO_KPI_INTRO =
  "Los registros obtenidos reflejan el siguiente comparativo entre los indicadores mínimos requeridos y el desempeño promedio del trabajador durante el periodo evaluado:";

export const RESCISION_DESEMPENO_KPI_FOOTNOTE =
  "* Registros obtenidos de BLB CRM, RingCentral y Origination Tracker. El trabajador tuvo acceso a dichos registros y fue informado de su desempeño durante el periodo evaluado.";

export const RESCISION_DESEMPENO_FUNDAMENTO_INTRO =
  "La presente rescisión se funda en los siguientes preceptos de la Ley Federal del Trabajo:";

export const RESCISION_DESEMPENO_FUNDAMENTO_ROWS: { article: string; text: string }[] = [
  {
    article: "Art. 47 LFT Frac. XI",
    text: "Son causas de rescisión de la relación de trabajo, sin responsabilidad para el patrón, el incumplimiento de las obligaciones que imponga el contrato individual, siempre que sean de importancia y que el patrón no las haya renunciado previamente.",
  },
  {
    article: "Art. 134 LFT Frac. I y X",
    text: "Son obligaciones de los trabajadores: desempeñar el servicio bajo la dirección del patrón con la intensidad, cuidado y esmero apropiados, y observar las disposiciones contractuales relativas a la disciplina y el rendimiento.",
  },
  {
    article: "Art. 47 LFT Último párrafo",
    text: "El patrón deberá dar al trabajador aviso escrito de la fecha y causa o causas de la rescisión. El aviso deberá entregarse personalmente al trabajador.",
  },
];

export const RESCISION_DESEMPENO_DECLARACION_TEMPLATE =
  "Por medio del presente documento, {company_name}, por conducto de su representante legal, notifica formalmente al(a la) Sr.(a) {trabajador_name} la RESCISIÓN DE SU CONTRATO INDIVIDUAL DE TRABAJO SIN RESPONSABILIDAD PARA LA EMPRESA, con efectos a partir del día {termination_date_long}, con fundamento en el artículo 47, fracción XI de la Ley Federal del Trabajo, en razón del incumplimiento reiterado y documentado de los indicadores de desempeño establecidos en su contrato de trabajo.";

export const RESCISION_DESEMPENO_DECLARACION_2 =
  "La rescisión obedece exclusivamente al incumplimiento de las métricas de desempeño contractualmente pactadas, sin que medie discriminación, represalia ni violación a derecho laboral alguno.";

export const RESCISION_DESEMPENO_LIQUIDACION_INTRO =
  "La empresa cubrirá al trabajador(a), en un plazo no mayor a cinco (5) días hábiles a partir de la fecha efectiva de baja, los conceptos que correspondan conforme a ley:";

export const RESCISION_DESEMPENO_LIQUIDACION_BULLETS: string[] = [
  "Salario devengado hasta la fecha efectiva de rescisión.",
  "Parte proporcional de días de descanso obligatorio (art. 74 LFT).",
  "Parte proporcional de vacaciones y prima vacacional (arts. 76–80 LFT).",
  "Parte proporcional de aguinaldo (art. 87 LFT).",
  "Devolución de documentos originales y constancia de trabajo (art. 132, frac. XIII LFT).",
];

export const RESCISION_DESEMPENO_NO_INDEMNIZACION =
  "Al tratarse de una rescisión por causa justificada imputable al trabajador (art. 47 LFT), no procede el pago de indemnización constitucional (tres meses de salario, art. 50 LFT) ni de prima de antigüedad (art. 162 LFT).";

export const RESCISION_DESEMPENO_ENTREGA_INTRO =
  "El trabajador se obliga a entregar en su último día laborado lo siguiente:";

export const RESCISION_DESEMPENO_ENTREGA_BULLETS: string[] = [
  "Equipo de cómputo y accesorios asignados, en las mismas condiciones de entrega.",
  "Credencial y cualquier identificación interna de la empresa.",
  "Cualquier otro material, documento o herramienta propiedad de la empresa.",
];

export const RESCISION_DESEMPENO_ACUSE =
  "El(La) trabajador(a) abajo firmante declara haber recibido personalmente el presente aviso de rescisión, estar en conocimiento de su contenido, causas y fundamento legal, y no tener reclamación laboral pendiente al momento de la firma, sin perjuicio del pago de los conceptos de liquidación señalados en el apartado VI.";

// ── Constancia de Uptraining / Capacitación Continua ────────────────
// Light-fill printable form. The app auto-populates the agent header and the
// KPI-minimums table (from campaign_kpi_config); the coach/TL fills sessions,
// topics, commitments and signatures by hand, then scans the signed copy.

export const UPTRAINING_TITLE = "CONSTANCIA DE UPTRAINING / CAPACITACIÓN CONTINUA";

export const UPTRAINING_SUBTITLE =
  "Registro individual de sesión(es) de reforzamiento y seguimiento de desempeño";

// Section III.A — predefined topics. Rendered as blank checkboxes to mark by hand.
export const UPTRAINING_TOPICS: string[] = [
  "Presentación y pitch de apertura",
  "Manejo de objeciones",
  "Calificación del prospecto",
  "Proceso de aprobación del producto",
  "Uso de CRM",
  "Registro en Origination Tracker",
  "Agendado de citas en Google Calendar",
  "Seguimiento de cita (call cadence)",
  "Talk time y llamadas por hora",
  "Package Back / Credit Pull / Sets / Activations",
  "Calidad de llamada (QA)",
  "Escalación a Team Lead / Manager",
  "Manejo de disposiciones en CRM",
  "Conocimiento del producto",
  "Revisión de grabaciones propias",
  "Role play con supervisor",
  "Manejo del tiempo en piso",
  "Políticas de asistencia y puntualidad",
  "Reporteo diario de métricas",
];

export const UPTRAINING_SESSION_HEADERS: string[] = [
  "#",
  "Fecha",
  "Horario",
  "Instructor / Coach",
  "Duración (hrs)",
  "Modalidad",
];

export const UPTRAINING_KPI_HEADERS: string[] = [
  "Indicador / KPI",
  "Mínimo requerido",
  "Promedio del agente",
  "Meta post-uptraining",
  "Cumple",
];

export const UPTRAINING_FIRMAS_INTRO =
  "Las partes abajo firmantes declaran que el uptraining descrito fue impartido y recibido en los términos indicados en el presente documento.";

export const UPTRAINING_FOOTER =
  "Documento interno  ·  Recursos Humanos  ·  Outsource Consulting Group S.A.S.  ·  Guadalajara, Jalisco";

export const UPTRAINING_LEGAL_REP_NAME = "DIOMEDES SANDOVAL ROJAS";
export const UPTRAINING_LEGAL_REP_TITLE =
  "Representante legal  ·  Outsource Consulting Group";

// ── Template rendering helper ───────────────────────────────────────

export function renderTemplate(
  template: string,
  vars: Record<string, string>,
): string {
  return template.replace(/\{(\w+)\}/g, (_, key) => vars[key] ?? `{${key}}`);
}
