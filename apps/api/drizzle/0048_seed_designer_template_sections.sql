-- Backfill the designer's documented automatic sections and the supplied rigid-ball example.
-- The automatic classification follows cdr-example data/pim-sections.js and app.js secAuto.
UPDATE attribute_templates SET sections = CASE WHEN category_id IN (
  SELECT id FROM catalog_categories WHERE slug = 'rodamientos-y-afines-rodamiento-de-bolas-rigido'
) THEN '[{"key": "ident", "label": "Identificación del producto", "position": 0}, {"key": "car", "label": "Características / Especificaciones", "position": 1}, {"key": "dim", "label": "Dimensiones", "position": 2}, {"key": "rend", "label": "Datos de rendimiento", "position": 3}, {"key": "docs", "label": "Documentos y activos", "position": 4}, {"key": "emp", "label": "Empaque", "position": 5}]'::jsonb ELSE '[{"key": "ident", "label": "Identificación del producto", "position": 0}, {"key": "car", "label": "Características / Especificaciones", "position": 1}, {"key": "dim", "label": "Dimensiones y datos de rendimiento", "position": 2}, {"key": "docs", "label": "Documentos y activos", "position": 3}, {"key": "emp", "label": "Empaque", "position": 4}]'::jsonb END
WHERE sections = '[]'::jsonb;
UPDATE template_attribute_assignments a SET section_key = CASE
 WHEN d.source_authority = 'erp' THEN 'ident'
 WHEN d.key ~ '(ficha_tecnica|ficha_de_seguridad|certificado|fotografia|^plano$)' THEN 'docs'
 WHEN d.label ~* '^(c[oó]digo[[:space:]]*ean|peso|unds?[[:space:]]*por[[:space:]]*caja|unidades[[:space:]]*por[[:space:]]*caja)' THEN 'emp'
 WHEN d.data_type = 'measurement' OR d.label ~ '^\([^)]+\)' THEN 'dim'
 ELSE 'car' END
FROM attribute_definitions d WHERE d.id = a.attribute_definition_id AND a.section_key IS NULL;
UPDATE template_attribute_assignments a SET section_key = mapped.section_key FROM (
 SELECT a2.template_id, a2.attribute_definition_id, CASE replace(d.key, '_', '')
WHEN 'codigoarticulo' THEN 'ident'
WHEN 'codigoproveedor' THEN 'ident'
WHEN 'codigounificador' THEN 'ident'
WHEN 'categorian1' THEN 'ident'
WHEN 'categorian2' THEN 'ident'
WHEN 'categorian3' THEN 'ident'
WHEN 'tipoaplicacion' THEN 'ident'
WHEN 'marca' THEN 'ident'
WHEN 'frecuencia' THEN 'ident'
WHEN 'ecommerce' THEN 'ident'
WHEN 'bloqueadoventa' THEN 'ident'
WHEN 'bloqueadocompra' THEN 'ident'
WHEN 'especificaciontecnica' THEN 'ident'
WHEN 'codigodefabrica' THEN 'ident'
WHEN 'marcado' THEN 'ident'
WHEN 'etiqueta' THEN 'ident'
WHEN 'codigoean' THEN 'ident'
WHEN 'materialdelajaula' THEN 'car'
WHEN 'clasedetolerancia' THEN 'car'
WHEN 'lubricante' THEN 'car'
WHEN 'juegoradialinterno' THEN 'car'
WHEN 'sellos' THEN 'car'
WHEN 'tipodesello' THEN 'car'
WHEN 'tipodeagujero' THEN 'car'
WHEN 'hileras' THEN 'car'
WHEN 'ddiametrodelagujeromm' THEN 'dim'
WHEN 'ddiametroexteriormm' THEN 'dim'
WHEN 'balturamm' THEN 'dim'
WHEN 'damindiametrominimoresaltedeleje' THEN 'dim'
WHEN 'damaxdiametromaximodelresaltedelalojamiento' THEN 'dim'
WHEN 'ramaxradiomaximodegarganta' THEN 'dim'
WHEN 'rmincotadechaflanminima' THEN 'dim'
WHEN 'd1diametrodelresaltedelanilloexterior' THEN 'dim'
WHEN 'd1diametrodelresaltedelanillointerior' THEN 'dim'
WHEN 'd2diametrodelcalibredelanillointerior' THEN 'dim'
WHEN 'crcapacidaddecargadinamicaradialn' THEN 'rend'
WHEN 'c0rcapacidaddecargaestaticaradialn' THEN 'rend'
WHEN 'curlimitedecargaporfatigaradialn' THEN 'rend'
WHEN 'ngvelocidadlimitederotacion' THEN 'rend'
WHEN 'tmintemperaturamindefuncionamiento' THEN 'rend'
WHEN 'tmaxtemperaturamaxdefuncionamiento' THEN 'rend'
WHEN 'f0factordecalculo' THEN 'rend'
WHEN 'fichatecnica' THEN 'docs'
WHEN 'fichadeseguridadmsds' THEN 'docs'
WHEN 'certificadodeconformidaddistribuidorautorizadooriginalidad' THEN 'docs'
WHEN 'fotografiasdelproducto' THEN 'docs'
WHEN 'plano' THEN 'docs'
WHEN 'pesokg' THEN 'emp'
WHEN 'mpesokg' THEN 'emp'
WHEN 'undsporcajajuego' THEN 'emp'
 ELSE a2.section_key END AS section_key
 FROM template_attribute_assignments a2 JOIN attribute_definitions d ON d.id = a2.attribute_definition_id
 JOIN attribute_templates t ON t.id = a2.template_id JOIN catalog_categories c ON c.id = t.category_id
 WHERE c.slug = 'rodamientos-y-afines-rodamiento-de-bolas-rigido'
) mapped WHERE a.template_id = mapped.template_id AND a.attribute_definition_id = mapped.attribute_definition_id;
-- Reverse: retain editorial metadata; removing it would discard administrator configuration.
