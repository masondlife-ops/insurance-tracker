/* ============================================================================
   hub-outcomes-ui.js -- the Call outcomes settings section, shared.

   The section itself only ever needed HubOutcomes; the one page-specific bit
   was repainting Activity's chips and tiles after a change. That is now a hook:
   Activity sets HubOutcomesUI.onChange, every other page leaves it unset and
   simply edits the list.
   ========================================================================== */
(function (global) {
  "use strict";

  var changed = null;
  function notifyChanged() { if (typeof changed === "function") { try { changed(); } catch (e) {} } }

  global.HubOutcomesUI = {
    /* Activity passes its repaint here. */
    onChange: function (fn) { changed = fn; }
  };

  if (!global.HubSettings || !global.HubOutcomes) return;

  HubSettings.register({
    title: "Call outcomes",
    order: 20,
    render: function (wrap) {
      var list = document.createElement("div");
      list.className = "hs-list";
      wrap.appendChild(list);

      function paintList() {
        list.innerHTML = "";
        var custom = HubOutcomes.custom();
        if (!custom.length) {
          var empty = document.createElement("div");
          empty.className = "hs-empty";
          empty.textContent = "No custom outcomes yet.";
          list.appendChild(empty);
          return;
        }
        custom.forEach(function (c) {
          var row = document.createElement("div");
          row.className = "hs-item";
          var nm = document.createElement("span");
          nm.className = "nm"; nm.textContent = c.label;
          var where = document.createElement("span");
          where.className = "where"; where.textContent = "after " + HubOutcomes.anchorLabel(c.after);
          var ratesLbl = document.createElement("label");
          ratesLbl.className = "hs-inline-toggle";
          var ratesCb = document.createElement("input");
          ratesCb.type = "checkbox";
          ratesCb.checked = c.inRates !== false;
          ratesCb.onchange = function () {
            var updated = HubOutcomes.custom().map(function (x) {
              return x.key === c.key ? Object.assign({}, x, { inRates: ratesCb.checked }) : x;
            });
            HubOutcomes.save(updated);
            notifyChanged();
          };
          ratesLbl.appendChild(ratesCb);
          ratesLbl.appendChild(document.createTextNode("Rates"));
          var del = document.createElement("button");
          del.className = "hs-btn danger"; del.type = "button"; del.textContent = "Remove";
          del.onclick = function () {
            HubOutcomes.save(HubOutcomes.custom().filter(function (x) { return x.key !== c.key; }));
            paintList();
            notifyChanged();
          };
          row.appendChild(nm); row.appendChild(where); row.appendChild(ratesLbl); row.appendChild(del);
          list.appendChild(row);
        });
      }
      paintList();

      var arow = document.createElement("div");
      arow.className = "hs-row";
      var nameInput = document.createElement("input");
      nameInput.className = "hs-input grow";
      nameInput.type = "text";
      nameInput.placeholder = "e.g. 10+ min";
      arow.appendChild(nameInput);
      var afterSel = document.createElement("select");
      afterSel.className = "hs-input";
      HubOutcomes.ANCHORS.forEach(function (k) {
        var o = document.createElement("option");
        o.value = k; o.textContent = "after " + HubOutcomes.anchorLabel(k);
        afterSel.appendChild(o);
      });
      afterSel.value = "conv5";
      arow.appendChild(afterSel);
      var addBtn = document.createElement("button");
      addBtn.className = "hs-btn primary"; addBtn.type = "button"; addBtn.textContent = "Add";
      arow.appendChild(addBtn);
      wrap.appendChild(arow);

      var cbRow = document.createElement("label");
      cbRow.className = "hs-checkrow";
      var includeCb = document.createElement("input");
      includeCb.type = "checkbox";
      includeCb.checked = true;
      cbRow.appendChild(includeCb);
      cbRow.appendChild(document.createTextNode("Include in Conversion Rates"));
      wrap.appendChild(cbRow);

      var err = document.createElement("div");
      err.className = "hs-err";
      wrap.appendChild(err);

      addBtn.onclick = function () {
        var label = nameInput.value.trim();
        var after = afterSel.value;
        var problem = HubOutcomes.validate(label, after);
        if (problem) { err.textContent = problem; return; }
        err.textContent = "";
        var key = HubOutcomes.slug(label);
        HubOutcomes.save(HubOutcomes.custom().concat([{ key: key, label: label, chipLabel: label, short: label.toLowerCase(), after: after, inRates: includeCb.checked }]));
        nameInput.value = "";
        includeCb.checked = true;
        paintList();
        notifyChanged();
      };

    }
  });

})(window);
