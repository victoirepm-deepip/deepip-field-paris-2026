/**
 * Optional second file for the bound Apps Script project. Paste it in as a new
 * file (+ > Script) next to Code.gs and run a function from the editor. It
 * changes nothing and writes nothing — and it needs no new deployment, because
 * running a function in the editor is not serving the web app.
 *
 * It deliberately logs row numbers and column names, never cell values, so the
 * output can be pasted into a chat or a ticket without carrying a guest's name,
 * email or deal into it. The one exception is the names of the DeepIP team in
 * the coverage columns, which is the point of coverageLoad().
 *
 * Depends on Code.gs being in the same project: resolveTab, findHeaderRow,
 * resolveColumns and cell all come from there.
 */

/**
 * Why the app sees fewer people than the tab has rows.
 *
 * buildContacts() skips a row when First name, Last name AND Organization are
 * all empty, because a row with none of the three cannot be shown, searched or
 * joined to an encounter. That is the only row the app silently drops, and this
 * prints exactly which ones and what they do contain.
 *
 * A dropped row with nothing in it at all is almost always a formula dragged one
 * row too far — the Photo URL column is filled by formula from the Photos tab,
 * and one extra row of it is enough to make the tab look longer than it is.
 * A dropped row that still has a Key or an Email is a real person with their
 * name missing, and they are invisible to the app until it is filled in.
 */
function findDroppedRows() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sheet = resolveTab(ss, 'contacts', null);
  var headerRow = findHeaderRow(sheet, CONTACT_COLUMNS);
  var cols = resolveColumns(sheet, headerRow, CONTACT_COLUMNS, [], sheet.getName());
  var lastRow = sheet.getLastRow();
  var lastCol = sheet.getLastColumn();

  Logger.log('Tab "' + sheet.getName() + '", header row ' + headerRow +
             ', last row ' + lastRow + ' -> ' + (lastRow - headerRow) + ' data rows');

  if (lastRow <= headerRow) { Logger.log('No data rows at all.'); return; }

  var values = sheet.getRange(headerRow + 1, 1, lastRow - headerRow, lastCol).getValues();
  var headers = sheet.getRange(headerRow, 1, 1, lastCol).getValues()[0];

  var kept = 0, dropped = [];
  for (var i = 0; i < values.length; i++) {
    var r = values[i];
    var rowNumber = headerRow + 1 + i;
    var first = cell(r, cols, 'firstName');
    var last  = cell(r, cols, 'lastName');
    var firm  = cell(r, cols, 'firm');
    if (first || last || firm) { kept++; continue; }

    // What IS in this row, by column name, so it can be identified without
    // printing anything that was typed into it.
    var filled = [];
    for (var ciX = 0; ciX < lastCol; ciX++) {
      var v = r[ciX];
      if (v !== '' && v !== null && v !== undefined && String(v).trim() !== '') {
        filled.push(String(headers[ciX] || ('column ' + (ciX + 1))).trim());
      }
    }
    dropped.push({ row: rowNumber, filled: filled });
  }

  Logger.log('the app sees ' + kept + ' people');
  if (!dropped.length) {
    Logger.log('nothing dropped: every data row has a name or an organization.');
    Logger.log('So a count that disagrees with the app is a disagreement about');
    Logger.log('what is on the tab, not about what the app reads.');
    return;
  }
  Logger.log(dropped.length + ' row(s) dropped, because First name, Last name and Organization are all empty:');
  dropped.forEach(function (d) {
    Logger.log('  row ' + d.row + ' -> ' +
      (d.filled.length ? 'still has: ' + d.filled.join(', ') : 'completely empty'));
  });
  Logger.log('');
  Logger.log('"completely empty"            -> delete the row, nobody is missing.');
  Logger.log('"still has: Photo URL"        -> a formula dragged one row too far. Delete the row.');
  Logger.log('"still has: Key, Email, ..."  -> a real guest with no name. Fill First name,');
  Logger.log('                                 Last name and Organization, or they stay invisible.');
}

/**
 * What the app will put in each person's "My list", read the way the app reads
 * it. Compare these numbers with the Coverage tab.
 *
 * The app matches a user to a guest by looking for their configured owner name
 * INSIDE the Covered by cell, accents stripped, case ignored. Those names are
 * surnames (config.js, USERS.ownerNames), so a cell holding a short name or a
 * nickname matches nobody and that person's list comes up empty. This prints
 * the distinct values actually in the column, which is the fastest way to see
 * that before the night rather than during it.
 */
function coverageLoad() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sheet = resolveTab(ss, 'contacts', null);
  var headerRow = findHeaderRow(sheet, CONTACT_COLUMNS);
  var cols = resolveColumns(sheet, headerRow, CONTACT_COLUMNS, [], sheet.getName());
  var lastRow = sheet.getLastRow();
  if (lastRow <= headerRow) { Logger.log('No data rows.'); return; }
  var values = sheet.getRange(headerRow + 1, 1, lastRow - headerRow, sheet.getLastColumn()).getValues();

  ['ownership', 'backup', 'priority', 'population'].forEach(function (key) {
    if (!cols[key]) { Logger.log(key + ': column not found'); return; }
    var counts = {}, blank = 0;
    values.forEach(function (r) {
      var first = cell(r, cols, 'firstName'), last = cell(r, cols, 'lastName'), firm = cell(r, cols, 'firm');
      if (!first && !last && !firm) return;          // the rows the app drops
      var v = cell(r, cols, key);
      if (!v) { blank++; return; }
      counts[v] = (counts[v] || 0) + 1;
    });
    var label = sheet.getRange(headerRow, cols[key]).getValue();
    Logger.log('--- ' + label + ' ---');
    Object.keys(counts).sort().forEach(function (k) { Logger.log('  ' + counts[k] + '  ' + k); });
    if (blank) Logger.log('  ' + blank + '  (blank)');
    Logger.log('');
  });
  Logger.log('Covered by and Backup must spell the surname the app knows');
  Logger.log('(config.js, USERS.ownerNames). A value that does not contain one');
  Logger.log('of those surnames gives that person an empty list.');
}

/**
 * Two rows that look like the same person to the app.
 *
 * Encounters are joined to contacts on normalised name + organisation, never on
 * a row number, because rows move when late registrations are added. Two rows
 * with the same name and organisation therefore collapse into one card, and
 * every capture made against either of them lands on the first. Row numbers
 * only, so the output stays safe to paste.
 */
function findDuplicatePeople() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sheet = resolveTab(ss, 'contacts', null);
  var headerRow = findHeaderRow(sheet, CONTACT_COLUMNS);
  var cols = resolveColumns(sheet, headerRow, CONTACT_COLUMNS, [], sheet.getName());
  var lastRow = sheet.getLastRow();
  if (lastRow <= headerRow) { Logger.log('No data rows.'); return; }
  var values = sheet.getRange(headerRow + 1, 1, lastRow - headerRow, sheet.getLastColumn()).getValues();

  function norm(s) {
    return String(s == null ? '' : s).toLowerCase()
      .normalize('NFD').replace(/[̀-ͯ]/g, '')
      .replace(/[^a-z0-9]+/g, ' ').trim();
  }

  var seen = {}, dupes = 0;
  for (var i = 0; i < values.length; i++) {
    var r = values[i], rowNumber = headerRow + 1 + i;
    var first = cell(r, cols, 'firstName'), last = cell(r, cols, 'lastName'), firm = cell(r, cols, 'firm');
    if (!first && !last && !firm) continue;
    var k = norm(first + ' ' + last) + '|' + norm(firm);
    if (seen[k]) { Logger.log('rows ' + seen[k] + ' and ' + rowNumber + ' are the same person to the app'); dupes++; }
    else seen[k] = rowNumber;
  }
  Logger.log(dupes ? dupes + ' duplicate(s). Merge or delete before the event.'
                   : 'No duplicates: every row is a distinct person to the app.');
}
