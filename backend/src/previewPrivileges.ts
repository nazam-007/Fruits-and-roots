export type PreviewRelation = {
  schema_name: string; relation_name: string; schema_usage: boolean;
  can_read: boolean; table_mutation: boolean; column_mutation: boolean;
};
export function forbiddenPreviewRelation(row: PreviewRelation): boolean {
  const approved = row.schema_name === "public" &&
    ["categories", "products", "product_variants"].includes(row.relation_name);
  // Mutation grants remain forbidden even if schema USAGE currently blocks use.
  return row.table_mutation || row.column_mutation ||
    (row.schema_usage && row.can_read && !approved);
}
export const previewRelationsSql = `SELECT n.nspname AS schema_name,c.relname AS relation_name,
 has_schema_privilege(current_user,n.oid,'USAGE') AS schema_usage,
 has_any_column_privilege(current_user,c.oid,'SELECT') AS can_read,
 has_table_privilege(current_user,c.oid,'INSERT,UPDATE,DELETE,TRUNCATE,MAINTAIN,REFERENCES,TRIGGER') AS table_mutation,
 has_any_column_privilege(current_user,c.oid,'INSERT,UPDATE,REFERENCES') AS column_mutation
 FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
 WHERE n.nspname NOT IN ('pg_catalog','information_schema') AND n.nspname !~ '^pg_'
 AND c.relkind IN ('r','p','v','m','f')`;
export const previewCapabilitiesSql = `SELECT
 EXISTS (SELECT 1 FROM pg_auth_members m
 WHERE m.member=(SELECT oid FROM pg_roles WHERE rolname=current_user)
 OR (m.roleid=(SELECT oid FROM pg_roles WHERE rolname=current_user) AND NOT (
 m.member=(SELECT oid FROM pg_roles WHERE rolname='postgres')
 AND m.admin_option AND NOT m.inherit_option AND NOT m.set_option
 AND m.grantor=10 AND EXISTS (SELECT 1 FROM pg_roles g WHERE g.oid=m.grantor AND g.rolsuper)
 ))) AS memberships,
 has_database_privilege(current_user,current_database(),'CREATE') AS database_create,
 EXISTS (SELECT 1 FROM pg_namespace n WHERE n.nspname NOT IN ('pg_catalog','information_schema')
 AND n.nspname !~ '^pg_' AND has_schema_privilege(current_user,n.oid,'CREATE')) AS schema_create,
 EXISTS (SELECT 1 FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
 WHERE n.nspname NOT IN ('pg_catalog','information_schema') AND n.nspname !~ '^pg_'
 AND CASE WHEN c.relkind='S' THEN has_sequence_privilege(current_user,c.oid,'SELECT,USAGE,UPDATE') ELSE false END) AS sequence_grant,
 EXISTS (SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
 WHERE n.nspname NOT IN ('pg_catalog','information_schema') AND n.nspname !~ '^pg_'
 AND p.prokind IN ('f','p','w') AND p.prosecdef
 AND has_schema_privilege(current_user,n.oid,'USAGE')
 AND has_function_privilege(current_user,p.oid,'EXECUTE')) AS reachable_definer`;
export function assertPreviewPrivileges(role: Record<string, unknown>, relations: PreviewRelation[], capabilities: Record<string, unknown>) {
  if (role.name !== "fruits_roots_menu_preview" || role.read_only !== "on" || role.rolcanlogin !== true ||
      ["rolinherit","rolsuper","rolbypassrls","rolcreatedb","rolcreaterole","rolreplication"].some(flag => role[flag] !== false)) {
    throw new Error("Preview role validation failed");
  }
  if (["memberships","database_create","schema_create","sequence_grant","reachable_definer"].some(flag => capabilities[flag] !== false) ||
      relations.some(row => typeof row.schema_name !== "string" || typeof row.relation_name !== "string" ||
        [row.schema_usage,row.can_read,row.table_mutation,row.column_mutation].some(flag => typeof flag !== "boolean") || forbiddenPreviewRelation(row))) throw new Error("Preview privilege validation failed");
  for (const name of ["categories","products","product_variants"]) {
    if (!relations.some(row => row.schema_name === "public" && row.relation_name === name && row.schema_usage && row.can_read)) {
      throw new Error("Preview menu access missing");
    }
  }
}
