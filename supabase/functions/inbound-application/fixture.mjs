// Mirrors the real Gravity Forms notification structure observed in
// recruiting_candidates.raw_email_body.
export function field(label, value) {
  return `<tr bgcolor="#EAF2FA">
    <td colspan="2">
      <font style="font-family: sans-serif; font-size:12px;"><strong>${label}</strong></font>
    </td>
  </tr>
  <tr bgcolor="#FFFFFF">
    <td width="20">&nbsp;</td>
    <td>
      <font style="font-family: sans-serif; font-size:12px;">${value}</font>
    </td>
  </tr>`;
}
export function email(fields) {
  return `<html><head><title>New Application - Employment Application (Staging)</title></head><body>
  <table width="99%" border="0"><tr><td>
  <table width="100%" border="0">
  ${fields.map(([l, v]) => field(l, v)).join("\n")}
  </table></td></tr></table></body></html>`;
}
