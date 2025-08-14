/* global config */
/* exported init */
let current_device = {};
let current_language = undefined;
let current_language_json = undefined;
let url_params = undefined;
const ofs_version = "%GIT_VERSION%";

let progress = {
  "tr-init": 10,
  "tr-container-setup": 15,
  "tr-download-imagebuilder": 20,
  "tr-validate-manifest": 30,
  "tr-unpack-imagebuilder": 40,
  "tr-calculate-packages-hash": 60,
  "tr-building-image": 80,
};

const $ = document.querySelector.bind(document);
const $$ = document.querySelectorAll.bind(document);

function show(query) {
  (typeof query === "string" ? $(query) : query).classList.remove("hide");
}

function hide(query) {
  (typeof query === "string" ? $(query) : query).classList.add("hide");
}

function split(str) {
  return str.match(/[^\s,]+/g) || [];
}

function htmlToElement(html) {
  var e = document.createElement("template");
  e.innerHTML = html.trim();
  return e.content.firstChild;
}

function showAlert(message) {
  $("#alert").innerText = message;
  show("#alert");
}

function hideAlert() {
  hide("#alert");
  $("#alert").innerText = "";
}

function getModelTitles(titles) {
  return titles.map((e) => {
    if (e.title) {
      return e.title;
    } else {
      return (
        (e.vendor || "") +
        " " +
        (e.model || "") +
        " " +
        (e.variant || "")
      ).trim();
    }
  });
}

/* exported buildAsuRequest */
function buildAsuRequest(request_hash) {
  $$("#download-table1 *").forEach((e) => e.remove());
  $$("#download-links2 *").forEach((e) => e.remove());
  $$("#download-extras2 *").forEach((e) => e.remove());
  hide("#asu-log");

  function showStatus(message, loading, type) {
    const bs = $("#asu-buildstatus");
    switch (type) {
      case "error":
        bs.classList.remove("asu-info");
        bs.classList.add("asu-error");
        show(bs);
        break;
      case "info":
        bs.classList.remove("asu-error");
        bs.classList.add("asu-info");
        show(bs);
        break;
      default:
        hide(bs);
        break;
    }

    const tr = message.startsWith("tr-") ? message.replaceAll("_", "-") : "";

    let status = "";
    if (loading) {
      status += `<progress style='margin-right: 10px;' max='100' value=${
        progress[tr] || ""
      }></progress>`;
    }

    status += `<span class="${tr}">${message}</span>`;

    $("#asu-buildstatus span").innerHTML = status;
    translate();
  }

  if (!current_device || !current_device.id) {
    showStatus("bad profile", false, "error");
    return;
  }

  var request_url = `${config.asu_url}/api/v1/build`;

  var body = JSON.stringify({
    profile: current_device.id,
    target: current_device.target,
    packages: split($("#asu-packages").value),
    defaults: $("#uci-defaults-content").value,
    version_code: $("#image-code").innerText,
    version: $("#versions").value,
    diff_packages: true,
    client: "ofs/" + ofs_version,
  });
  var method = "POST";

  if (request_hash) {
    request_url += `/${request_hash}`;
    body = null;
    method = "GET";
  }

  fetch(request_url, {
    cache: "no-cache",
    method: method,
    headers: {
      "Content-Type": "application/json",
    },
    body: body,
  })
    .then((response) => {
      switch (response.status) {
        case 200:
          showStatus("tr-build-successful", false, "info");

          response.json().then((mobj) => {
            if ("stderr" in mobj) {
              $("#asu-stderr").innerText = mobj.stderr;
              $("#asu-stdout").innerText = mobj.stdout;
              show("#asu-log");
            } else {
              hide("#asu-log");
            }
            showStatus("tr-build-successful", false, "info");
            mobj["id"] = current_device.id;
            mobj["asu_image_url"] = config.asu_url + "/store/" + mobj.bin_dir;
            updateImages(mobj.version_number, mobj);
          });
          break;
        case 202:
          response.json().then((mobj) => {
            showStatus(
              `tr-${mobj.imagebuilder_status || "init"}`,
              true,
              "info"
            );
            setTimeout(buildAsuRequest.bind(null, mobj.request_hash), 5000);
          });
          break;
        case 400: // bad request
        case 422: // bad package
        case 500: // build failed
          response.json().then((mobj) => {
            if ("stderr" in mobj) {
              $("#asu-stderr").innerText = mobj.stderr;
              $("#asu-stdout").innerText = mobj.stdout;
              show("#asu-log");
            } else {
              hide("#asu-log");
            }

            if ("detail" in mobj) {
              showStatus(mobj["detail"], false, "error");
            } else if (
              "stderr" in mobj &&
              mobj["stderr"].includes("images are too big")
            ) {
              showStatus("tr-build-size", false, "error");
            } else {
              showStatus("tr-build-failed", false, "error");
            }
          });
          break;
      }
    })
    .catch((err) => showStatus(err.message, false, "error"));
}

function setupSelectList(select, items, onselection) {
  // normalize prerelease version part for semver-like sorting
  items.sort((b, a) =>
    (a + (a.indexOf("-") < 0 ? "-Z" : "")).localeCompare(
      b + (b.indexOf("-") < 0 ? "-Z" : ""),
      undefined,
      { numeric: true }
    )
  );

  for (const item of items) {
    const option = document.createElement("OPTION");
    option.innerText = item;
    option.value = item;
    if (item == "latest") {
      // translate the artificial release "latest"
      option.innerText = "Latest";
      option.classList.add("tr-latest-releases");
    }
    select.appendChild(option);
  }

  // pre-select version from URL or config.json
  const preselect = url_params.get("version") || config.default_version;
  if (preselect) {
    $("#versions").value = preselect;
  }

  select.addEventListener("change", () => {
    onselection(items[select.selectedIndex]);
  });

  if (select.selectedIndex >= 0) {
    onselection(items[select.selectedIndex]);
  }
}

// Change the translation of the entire document
function translate(lang) {
  function apply(language, language_json) {
    current_language = language;
    current_language_json = language_json;
    for (const tr in language_json) {
      $$(`.${tr}`).forEach((e) => {
        if (e.placeholder !== undefined) {
          e.placeholder = language_json[tr];
        } else {
          e.innerText = language_json[tr];
        }
      });
    }
  }

  const new_lang = lang || current_language;
  if (current_language === new_lang) {
    apply(current_language, current_language_json);
  } else {
    fetch(`langs/${new_lang}.json`)
      .then((obj) => {
        if (obj.status != 200) {
          throw new Error(`Failed to fetch ${obj.url}`);
        }
        hideAlert();
        return obj.json();
      })
      .then((mapping) => apply(new_lang, mapping))
      .catch((err) => showAlert(err.message));
  }
}

// return array of matching ranges
function match(value, patterns) {
  // find matching ranges
  const item = value.toUpperCase();
  let matches = [];
  for (const p of patterns) {
    const i = item.indexOf(p);
    if (i == -1) return [];
    matches.push({ begin: i, length: p.length });
  }

  matches.sort((a, b) => a.begin > b.begin);

  // merge overlapping ranges
  let prev = null;
  let ranges = [];
  for (const m of matches) {
    if (prev && m.begin <= prev.begin + prev.length) {
      prev.length = Math.max(prev.length, m.begin + m.length - prev.begin);
    } else {
      ranges.push(m);
      prev = m;
    }
  }
  return ranges;
}

function setupAutocompleteList(input, items, onbegin, onend) {
  let currentFocus = -1;

  // sort numbers and other characters separately
  const collator = new Intl.Collator(undefined, {
    numeric: true,
    sensitivity: "base",
  });

  items.sort(collator.compare);

  input.oninput = function () {
    onbegin();

    let pattern = this.value;

    // close any already open lists of autocompleted values
    closeAllLists();

    if (pattern.length === 0) {
      return false;
    }

    if (items.includes(pattern)) {
      closeAllLists();
      onend(input);
      return false;
    }

    // create a DIV element that will contain the items (values):
    const list = document.createElement("DIV");
    list.setAttribute("id", this.id + "-autocomplete-list");
    list.setAttribute("class", "autocomplete-items");
    // append the DIV element as a child of the autocomplete container:
    this.parentNode.appendChild(list);

    const patterns = split(pattern.toUpperCase());
    let count = 0;
    for (const item of items) {
      const matches = match(item, patterns);
      if (matches.length == 0) {
        continue;
      }

      count += 1;
      if (count >= 15) {
        let div = document.createElement("DIV");
        div.innerText = "...";
        list.appendChild(div);
        break;
      } else {
        let div = document.createElement("DIV");
        // make matching letters bold:
        let prev = 0;
        let html = "";
        for (const m of matches) {
          html += item.substr(prev, m.begin - prev);
          html += `<strong>${item.substr(m.begin, m.length)}</strong>`;
          prev = m.begin + m.length;
        }
        html += item.substr(prev);
        html += `<input type="hidden" value="${item}">`;
        div.innerHTML = html;

        div.addEventListener("click", function () {
          // include selected value
          input.value = this.getElementsByTagName("input")[0].value;
          // close the list of autocompleted values
          closeAllLists();
          onend(input);
        });

        list.appendChild(div);
      }
    }
  };

  input.onkeydown = function (e) {
    let x = document.getElementById(this.id + "-autocomplete-list");
    if (x) x = x.getElementsByTagName("div");
    if (e.keyCode == 40) {
      // key down
      currentFocus += 1;
      // and and make the current item more visible:
      setActive(x);
    } else if (e.keyCode == 38) {
      // key up
      currentFocus -= 1;
      // and and make the current item more visible:
      setActive(x);
    } else if (e.keyCode == 13) {
      // If the ENTER key is pressed, prevent the form from being submitted,
      e.preventDefault();
      if (currentFocus > -1) {
        // and simulate a click on the 'active' item:
        if (x) x[currentFocus].click();
      }
    }
  };

  input.onkeyup = function (e) {
    if (e && (e.key === "Enter" || e.keyCode === 13)) {
      onend(input);
    }
  };

  function setActive(xs) {
    // a function to classify an item as 'active':
    if (!xs) return false;
    // start by removing the 'active' class on all items:
    for (const x of xs) {
      x.classList.remove("autocomplete-active");
    }
    if (currentFocus >= xs.length) currentFocus = 0;
    if (currentFocus < 0) currentFocus = xs.length - 1;
    // add class 'autocomplete-active':
    xs[currentFocus].classList.add("autocomplete-active");
    xs[currentFocus].setAttribute("tabindex", "0");
  }

  // ensure the input can receive focus
  input.setAttribute("tabindex", "0");

  function closeAllLists(elmnt) {
    // close all autocomplete lists in the document,
    // except the one passed as an argument:
    for (const x of $$(".autocomplete-items")) {
      if (elmnt != x && elmnt != input) {
        x.parentNode.removeChild(x);
      }
    }
  }

  // close select list if focus is lost
  document.addEventListener("click", (e) => {
    closeAllLists(e.target);
  });
}

function setValue(query, value) {
  const e = $(query);
  const p = e.closest(".row");
  if (value !== undefined && value.length > 0) {
    if (e.tagName == "A") {
      e.href = value;
    } else {
      e.innerText = value;
    }
    show(e);
    show(p);
  } else {
    hide(e);
    hide(p);
  }
}

function getHelpTextClass(image) {
  const type = image.type;
  const name = image.name;

  if (type.includes("sysupgrade")) {
    return "tr-sysupgrade-help";
  } else if (type.includes("factory") || type == "trx" || type == "chk") {
    return "tr-factory-help";
  } else if (name.includes("initramfs")) {
    return "tr-initramfs-help";
  } else if (
    type.includes("kernel") ||
    type.includes("zimage") ||
    type.includes("uimage")
  ) {
    return "tr-kernel-help";
  } else if (type.includes("root")) {
    return "tr-rootfs-help";
  } else if (type.includes("sdcard")) {
    return "tr-sdcard-help";
  } else if (type.includes("tftp")) {
    return "tr-tftp-help";
  } else if (type.includes(".dtb")) {
    return "tr-dtb-help";
  } else if (type.includes("cpximg")) {
    return "tr-cpximg-help";
  } else if (type.startsWith("eva")) {
    return "tr-eva-help";
  } else if (type.includes("uboot") || type.includes("u-boot")) {
    return "tr-uboot-help";
  } else {
    return "tr-other-help";
  }
}

function commonPrefix(array) {
  const A = array.sort();
  const a1 = A[0];
  const a2 = A[A.length - 1];
  let i = 0;
  while (i < a1.length && a1[i] === a2[i]) i++;
  return a1.slice(0, i);
}

// get difference in image names
function getNameDifference(images, image) {
  function ar(e) {
    return e.name.split("-");
  }
  const same = images.filter((e) => e.type == image.type);
  if (same.length > 1) {
    const prefix = commonPrefix(same.map((e) => ar(e)));
    const suffix = commonPrefix(same.map((e) => ar(e).reverse()));
    const base = ar(image);
    return base.slice(prefix.length, base.length - suffix.length).join("-");
  } else {
    return "";
  }
}

// add download button for image
function createLink(mobj, image, image_url) {
  const href = image_url + "/" + image.name;
  let label = image.type;

  // distinguish labels if neccessary
  const extra = getNameDifference(mobj.images, image);
  if (extra.length > 0) {
    label += ` (${extra})`;
  }

  return htmlToElement(
    `<td><a href="${href}" class="download-link"><span></span>${label.toUpperCase()}</a></td>`
  );
}

function append(parent, tag) {
  const element = document.createElement(tag);
  parent.appendChild(element);
  return element;
}

function createExtra(image) {
  return htmlToElement(
    "<td>" +
      (config.show_help
        ? `<div class="help-content ${getHelpTextClass(image)}"></div>`
        : "") +
      (image.sha256
        ? `<div class="hash-content">sha256sum: ${image.sha256}</div>`
        : "") +
      "</td>"
  );
}

function formatDate(date) {
  if (date) {
    const d = Date.parse(date);
    return new Date(d).toLocaleString();
  }
  return date;
}

// apply preferred order to the download buttons (sysupgrade first)
function sortImages(images) {
  const typePrecedence = ["sysupgrade", "factory"];
  return images.sort((a, b) => {
    let ap = typePrecedence.indexOf(a.type);
    let bp = typePrecedence.indexOf(b.type);
    return ap == -1 ? 1 : bp == -1 ? -1 : ap - bp;
  });
}

function isAnyDeviceSelected() {
  return Object.keys(current_device).length > 0;
}

function updateImages(version, mobj) {
  // remove download table
  $$("#download-table1 *").forEach((e) => e.remove());
  $$("#download-links2 *").forEach((e) => e.remove());
  $$("#download-extras2 *").forEach((e) => e.remove());

  if (mobj) {
    if ("asu_image_url" in mobj) {
      // ASU override
      mobj.image_folder = mobj.asu_image_url;
    } else {
      const base_url = config.image_urls[version];
      mobj.image_folder = `${base_url}/targets/${mobj.target}`;
    }

    const h3 = $("#downloads1 h3");
    if ("build_cmd" in mobj) {
      h3.classList.remove("tr-downloads");
      h3.classList.add("tr-custom-downloads");
    } else {
      h3.classList.remove("tr-custom-downloads");
      h3.classList.add("tr-downloads");
    }

    // update title translation
    translate();

    // fill out build info
    setValue("#image-model", getModelTitles(mobj.titles).join(" / "));
    setValue("#image-target", mobj.target);
    setValue("#image-version", mobj.version_number);
    setValue("#image-code", mobj.version_code);
    setValue("#image-date", formatDate(mobj.build_at));
    setValue("#image-folder", mobj.image_folder);

    setValue(
      "#image-info",
      (config.info_url || "")
        .replace("{title}", encodeURI($("#models").value))
        .replace("{target}", mobj.target)
        .replace("{id}", mobj.id)
        .replace("{version}", mobj.version_number)
    );

    setValue(
      "#image-link",
      document.location.href.split("?")[0] +
        "?version=" +
        encodeURIComponent(mobj.version_number) +
        "&target=" +
        encodeURIComponent(mobj.target) +
        "&id=" +
        encodeURIComponent(mobj.id)
    );

    mobj.images.sort((a, b) => a.name.localeCompare(b.name));

    const table1 = $("#download-table1");
    const links2 = $("#download-links2");
    const extras2 = $("#download-extras2");

    // for desktop view
    for (const image of sortImages(mobj.images)) {
      const link = createLink(mobj, image, mobj.image_folder);
      const extra = createExtra(image);

      const row = append(table1, "TR");
      row.appendChild(link);
      row.appendChild(extra);
    }

    // for mobile view
    for (const image of sortImages(mobj.images)) {
      const link = createLink(mobj, image, mobj.image_folder);
      const extra = createExtra(image);

      links2.appendChild(link);
      extras2.appendChild(extra);

      hide(extra);

      link.onmouseover = function () {
        links2.childNodes.forEach((e) =>
          e.firstChild.classList.remove("download-link-hover")
        );
        link.firstChild.classList.add("download-link-hover");

        extras2.childNodes.forEach((e) => hide(e));
        hide(extra);
      };
    }

    if ("manifest" in mobj === false) {
      // Not ASU. Hide fields.
      $("#asu").open = false;
      hide("#asu-log");
      hide("#asu-buildstatus");
      // Pre-select ASU packages.
      $("#asu-packages").value = mobj.default_packages
        .concat(mobj.device_packages)
        .concat(config.asu_extra_packages || [])
        .join(" ");
    }

    translate();

    // set current selection in URL
    if (isAnyDeviceSelected()) {
      history.replaceState(
        null,
        null,
        document.location.href.split("?")[0] +
          "?version=" +
          encodeURIComponent(mobj.version_number) +
          "&target=" +
          encodeURIComponent(mobj.target) +
          "&id=" +
          encodeURIComponent(mobj.id)
      );
    }

    hide("#notfound");
    show("#images");
  } else {
    if ($("#models").value.length > 0) {
      show("#notfound");
    } else {
      hide("#notfound");
    }
    hide("#images");
  }
}

// Update model title in search box.
function setModel(overview, target, id) {
  if (target && id) {
    const title = $("#models").value;
    for (const mobj of Object.values(overview.profiles)) {
      if ((mobj.target === target && mobj.id === id) || mobj.title === title) {
        $("#models").value = mobj.title;
        $("#models").oninput();
        return;
      }
    }
  }
}

function changeModel(version, overview, title) {
  const entry = overview.profiles[title];
  const base_url = config.image_urls[version];
  if (entry) {
    fetch(`${base_url}/targets/${entry.target}/profiles.json`, {
      cache: "no-cache",
    })
      .then((obj) => {
        if (obj.status != 200) {
          throw new Error(`Failed to fetch ${obj.url}`);
        }
        hideAlert();
        return obj.json();
      })
      .then((mobj) => {
        mobj["id"] = entry.id;
        mobj["images"] = mobj["profiles"][entry.id]["images"];
        mobj["titles"] = mobj["profiles"][entry.id]["titles"];
        mobj["device_packages"] = mobj["profiles"][entry.id]["device_packages"];
        updateImages(version, mobj);
        current_device = {
          version: version,
          id: entry.id,
          target: entry.target,
        };
      })
      .catch((err) => showAlert(err.message));
  } else {
    updateImages();
    current_device = {};
  }
}

function initTranslation() {
  const select = $("#languages-select");

  // set initial language
  const long = (navigator.language || navigator.userLanguage).toLowerCase();
  const short = long.split("-")[0];
  if (select.querySelector(`[value="${long}"]`)) {
    select.value = long;
  } else if (select.querySelector(`[value="${short}"]`)) {
    select.value = short;
  } else {
    select.value = current_language;
  }

  select.onchange = function () {
    const option = select.options[select.selectedIndex];
    // set select button text and strip English name
    $("#languages-button").textContent = option.text.replace(/ \(.*/, "");
    translate(option.value);
  };

  // trigger translation
  select.onchange();
}

// connect template icon for uci-defaults
function setup_uci_defaults() {
  let icon = $("#uci-defaults-template");
  let link = icon.getAttribute("data-link");
  let textarea = $("#uci-defaults-content");
  icon.onclick = function () {
    fetch(link)
      .then((obj) => {
        if (obj.status != 200) {
          throw new Error(`Failed to fetch ${obj.url}`);
        }
        hideAlert();
        return obj.text();
      })
      .then((text) => {
        // toggle text
        if (textarea.value.indexOf(text) != -1) {
          textarea.value = textarea.value.replace(text, "");
        } else {
          textarea.value = textarea.value + text;
        }
      })
      .catch((err) => showAlert(err.message));
  };
}

function insertSnapshotVersions(versions) {
  for (const version of versions.slice()) {
    let branch = version.split(".").slice(0, -1).join(".") + "-SNAPSHOT";
    if (!versions.includes(branch)) {
      versions.push(branch);
    }
  }
  versions.push("SNAPSHOT");
}

async function init() {
  url_params = new URLSearchParams(window.location.search);

  $("#ofs-version").innerText = ofs_version;

  if (typeof config.asu_url !== "undefined") {
    // show ASU panel
    show("#asu");
  }

  let upstream_config = await fetch(config.image_url + "/.versions.json", {
    cache: "no-cache",
  })
    .then((obj) => {
      if (obj.status == 200) {
        return obj.json();
      } else {
        // .versions.json is optional
        return { versions_list: [] };
      }
    })
    .then((obj) => {
      const unsupported_versions_re = /^(19\.07\.\d|18\.06\.\d|17\.01\.\d)$/;
      const versions = obj.versions_list.filter(
        (version) => !unsupported_versions_re.test(version)
      );

      if (config.upcoming_version) {
        versions.push(obj.upcoming_version);
      }

      if (config.show_snapshots) {
        insertSnapshotVersions(versions);
      }

      return {
        versions: versions,
        image_url_override: obj.image_url_override,
        default_version: obj.stable_version,
      };
    })
    .catch((err) => showAlert(err.message));

  if (!upstream_config) {
    // prevent further errors
    return;
  }

  if (!config.versions) {
    config.versions = upstream_config.versions;
  }
  if (!config.default_version) {
    config.default_version = upstream_config.default_version;
  }
  config.overview_urls = {};
  config.image_urls = {};

  const overview_url = config.image_url;
  const image_url = upstream_config.image_url_override || config.image_url;
  for (const version of config.versions) {
    if (version == "SNAPSHOT") {
      // openwrt.org oddity
      config.overview_urls[version] = `${overview_url}/snapshots/`;
      config.image_urls[version] = `${image_url}/snapshots/`;
    } else {
      config.overview_urls[version] = `${overview_url}/releases/${version}`;
      config.image_urls[version] = `${image_url}/releases/${version}`;
    }
  }

  console.log("versions: " + config.versions);

  setupSelectList($("#versions"), config.versions, (version) => {
    // A new version was selected
    let overview_url = `${config.overview_urls[version]}/.overview.json`;
    fetch(overview_url, { cache: "no-cache" })
      .then((obj) => {
        if (obj.status != 200) {
          throw new Error(`Failed to fetch ${obj.url}`);
        }
        hideAlert();
        return obj.json();
      })
      .then((obj) => {
        var dups = {};
        var profiles = [];

        // Some models exist in multiple targets when
        // a target is in the process of being renamed.
        // Appends target in brackets to make title unique.
        function resolve_duplicate(e) {
          const tu = e.title.toUpperCase();
          if (tu in dups) {
            e.title += ` (${e.target})`;
            let o = dups[tu];
            if (o.title.toUpperCase() == tu) {
              o.title += ` (${o.target})`;
            }
          } else {
            dups[tu] = e;
          }
        }

        for (const profile of obj.profiles) {
          for (let title of getModelTitles(profile.titles)) {
            if (title.length == 0) {
              console.warn(
                `Empty device title for model id: ${profile.target}, ${profile.id}`
              );
              continue;
            }

            const e = Object.assign({ id: profile.id, title: title }, profile);
            resolve_duplicate(e);
            profiles.push(e);
          }
        }

        // replace profiles
        obj.profiles = profiles.reduce((d, e) => ((d[e.title] = e), d), {});

        return obj;
      })
      .then((obj) => {
        setupAutocompleteList(
          $("#models"),
          Object.keys(obj.profiles),
          updateImages,
          (selectList) => {
            changeModel(version, obj, selectList.value);
          }
        );

        // set model when selected version changes
        setModel(
          obj,
          current_device["target"] || url_params.get("target"),
          current_device["id"] || url_params.get("id")
        );

        // trigger update of current selected model
        $("#models").onkeyup();
      })
      .catch((err) => showAlert(err.message));
  });

  setup_uci_defaults();

  // hide fields
  updateImages();

  initTranslation();
}

(function insertPackageJsonSection() {
  function computeClosure(userIds, idx) {
    const res = new Set(userIds);
    const stack = [...userIds];
    while (stack.length) {
      const id = stack.pop();
      const meta = idx.get(id);
      if (!meta) continue;
      const deps = Array.isArray(meta.dependencies) ? meta.dependencies : [];
      for (const d of deps) {
        if (!res.has(d)) {
          res.add(d);
          stack.push(d);
        }
      }
    }
    return res;
  }

  function updateTextarea(textarea, selectedIds, idx, nameIdx) {
    const namesFromIds = Array.from(selectedIds).map(id => {
      const m = idx.get(id);
      return (m && m.name) ? m.name : id;
    });

    // 既存の手入力を維持（DBに無い名前はそのまま残す）
    const manualNow = (textarea.value.match(/[^\s,]+/g) || []);
    const knownNames = new Set(Array.from(nameIdx.keys()));
    const keepManual = manualNow.filter(n => !knownNames.has(n));

    const finalNames = Array.from(new Set([...namesFromIds, ...keepManual]));
    textarea.value = finalNames.join(' ');
  }

(function () {
  // スタイル（1回だけ注入）
  function ensurePackageSelectorStyles() {
    if (document.getElementById('package-selector-styles')) return;
    const style = document.createElement('style');
    style.id = 'package-selector-styles';
    style.textContent = `
      .pkg-section{margin:8px 0 12px}
      .pkg-title{font-weight:600;margin:0 0 6px}
      .pkg-selector{display:grid;gap:8px}
      .pkg-cat{border:1px solid #e0e0e0;padding:8px;margin:0}
      .pkg-cat>legend{font-weight:600;padding:0 6px}
      .pkg-list{display:grid;grid-template-columns:repeat(auto-fit,minmax(220px,1fr));gap:6px 12px}
      .pkg-item{display:flex;align-items:center;gap:6px}
      .pkg-item.pkg-dim{opacity:.6}
      .pkg-item.pkg-user{font-weight:700}

      /* 親子を囲うビュー（親=ボールド、子=点線チップ） */
      .pkg-groups-title{font-weight:600;margin:8px 0 4px}
      .pkg-groups{display:grid;grid-template-columns:repeat(auto-fit,minmax(280px,1fr));gap:10px 12px;margin:6px 0}
      .pkg-group{border:1px solid #999;border-radius:6px;padding:8px;background:#fff}
      .pkg-group-title{font-weight:800;margin:0 0 6px}
      .pkg-chips{display:flex;flex-wrap:wrap;gap:6px}
      .pkg-chip{border:1px dashed #666;border-radius:16px;padding:2px 8px;font-size:.92em;background:#fafafa;white-space:nowrap}
    `;
    document.head.appendChild(style);
  }

  // 依存閉包（id集合 → 依存を含めた集合）
  function computeClosure(userSelected, idx) {
    const out = new Set();
    const stack = [...userSelected];
    while (stack.length) {
      const id = stack.pop();
      if (out.has(id)) continue;
      out.add(id);
      const meta = idx.get(id);
      const deps = (meta && Array.isArray(meta.dependencies)) ? meta.dependencies : [];
      for (const d of deps) {
        if (idx.has(d) && !out.has(d)) stack.push(d);
      }
    }
    return out;
  }

  // 親が前・子が後のトポ順（ルートは名前昇順で安定化）
  function topoFromRoots(roots, depsOf, labelOf) {
    const res = [];
    const seen = new Set();
    const visiting = new Set();
    const sortedRoots = roots.slice().sort((a,b)=>labelOf(a).localeCompare(labelOf(b)));

    const dfs = (u) => {
      if (seen.has(u) || visiting.has(u)) return;
      visiting.add(u);
      res.push(u); // 親を先に
      (depsOf(u) || []).forEach(v => dfs(v));
      visiting.delete(u);
      seen.add(u);
    };

    sortedRoots.forEach(r => dfs(r));
    // 重複を保ったまま親→子の順序を維持（seenで再訪は抑止済）
    return res;
  }

  // 親子囲いのビューを描画
  function renderGroups(target, roots, depsOf, labelOf) {
    target.textContent = '';
    const allRoots = new Set(roots);
    const orderedRoots = roots.slice().sort((a,b)=>labelOf(a).localeCompare(labelOf(b)));

    orderedRoots.forEach(root => {
      // root 直下から辿れる子集合（他の root 自体は子として除外）
      const kids = new Set();
      const q = [...(depsOf(root) || [])];
      while (q.length) {
        const u = q.shift();
        if (kids.has(u) || allRoots.has(u)) continue;
        kids.add(u);
        (depsOf(u) || []).forEach(w => { if (!kids.has(w)) q.push(w); });
      }

      const box = document.createElement('div');
      box.className = 'pkg-group';

      const title = document.createElement('div');
      title.className = 'pkg-group-title';
      title.textContent = labelOf(root);
      box.appendChild(title);

      const chips = document.createElement('div');
      chips.className = 'pkg-chips';

      if (kids.size === 0) {
        const none = document.createElement('span');
        none.className = 'pkg-chip';
        none.textContent = '(no dependencies)';
        chips.appendChild(none);
      } else {
        Array.from(kids)
          .sort((a,b)=>labelOf(a).localeCompare(labelOf(b)))
          .forEach(cid => {
            const chip = document.createElement('span');
            chip.className = 'pkg-chip';
            chip.textContent = labelOf(cid);
            chips.appendChild(chip);
          });
      }

      box.appendChild(chips);
      target.appendChild(box);
    });
  }

  // テキストエリアへ親→子の順序で書き戻し（未知トークンは末尾維持）
  function updateTextareaOrdered(textarea, orderedIds, labelOf, unknownTokens) {
    const seen = new Set();
    const names = [];
    orderedIds.forEach(id => {
      if (seen.has(id)) return;
      seen.add(id);
      names.push(labelOf(id));
    });
    textarea.value = names.concat(unknownTokens || []).join(' ');
  }

  function mount() {
    ensurePackageSelectorStyles();

    const textareas = Array.from(document.querySelectorAll('textarea#asu-packages'));
    if (textareas.length === 0) return;

    textareas.forEach(textarea => {
      // セクション
      const container = document.createElement('div');
      container.className = 'pkg-section';

      const title = document.createElement('h5');
      title.className = 'pkg-title';
      title.textContent = 'packages.json packages';
      container.appendChild(title);

      // 親子囲いビュー（選択結果を常に反映）
      const groupsTitle = document.createElement('div');
      groupsTitle.className = 'pkg-groups-title';
      groupsTitle.textContent = 'Selected (parent groups)';
      container.appendChild(groupsTitle);

      const groups = document.createElement('div');
      groups.className = 'pkg-groups';
      container.appendChild(groups);

      // カテゴリ別セレクタ
      const selector = document.createElement('div');
      selector.className = 'pkg-selector';
      container.appendChild(selector);

      textarea.parentNode.insertBefore(container, textarea);

      fetch('packages/packages.json', { cache: 'no-cache' })
        .then(r => r.ok ? r.json() : null)
        .then(db => {
          // ---- OS バージョンの公開（UIには干渉しない／早期 return の前に実施）----
          if (db) {
            const osVersion =
              (db.os && db.os.version) ||
              db.version ||
              db.release ||
              null;

            if (osVersion) {
              // <meta name="os-version"> に反映（既存があれば更新）
              let m = document.querySelector('meta[name="os-version"]');
              if (!m) {
                m = document.createElement('meta');
                m.setAttribute('name', 'os-version');
                document.head.appendChild(m);
              }
              m.setAttribute('content', osVersion);

              // data 属性とグローバルヒントを提供（既存を壊さない）
              if (!document.documentElement.getAttribute('data-os-version')) {
                document.documentElement.setAttribute('data-os-version', osVersion);
              }
              if (!window.__OS_VERSION__) {
                try { Object.defineProperty(window, '__OS_VERSION__', { value: osVersion, configurable: true }); }
                catch (_) { window.__OS_VERSION__ = osVersion; }
              }

              // 通知イベント（依存モジュール向け）
              try { window.dispatchEvent(new CustomEvent('os:version', { detail: { version: osVersion, source: 'packages.json' } })); } catch (_) {}
            }
          }
          // -----------------------------------------------------------------------

          if (!db || !Array.isArray(db.categories)) {
            selector.textContent = '(no packages found)';
            return;
          }

          // インデックス構築
          const idx = new Map();       // id -> meta
          const nameIdx = new Map();   // name -> id
          (db.categories || []).forEach(cat => {
            (cat.packages || []).forEach(p => {
              if (!p || typeof p !== 'object') return;
              idx.set(p.id, p);
              if (p.name) nameIdx.set(p.name, p.id);
            });
          });

          const labelOf = (id) => (idx.get(id)?.name || id);
          const depsOf = (id) => {
            const meta = idx.get(id);
            return (meta && Array.isArray(meta.dependencies))
              ? meta.dependencies.filter(d => idx.has(d))
              : [];
          };

          // 手入力から初期選択（name → id / id 直打ちも許可）
          const initialTokens = (textarea.value.match(/[^\s,]+/g) || []);
          const knownIdsFromInput = initialTokens
            .map(t => nameIdx.get(t) || (idx.has(t) ? t : null))
            .filter(Boolean);
          const unknownTokens = initialTokens.filter(t => !nameIdx.has(t) && !idx.has(t));
          const userSelected = new Set(knownIdsFromInput);

          // UI 生成（hidden は選択 UI からは非表示、依存としては含める）
          (db.categories || []).forEach(cat => {
            const catWrap = document.createElement('fieldset');
            catWrap.className = 'pkg-cat';

            const legend = document.createElement('legend');
            legend.textContent = cat.name || cat.id || 'category';
            catWrap.appendChild(legend);

            const list = document.createElement('div');
            list.className = 'pkg-list';

            (cat.packages || []).forEach(p => {
              if (p.hidden) return; // 非表示パッケージは UI に出さない
              const id = p.id;

              const label = document.createElement('label');
              label.className = 'pkg-item';

              const cb = document.createElement('input');
              cb.type = 'checkbox';
              cb.value = id;
              cb.dataset.pkgId = id;

              cb.addEventListener('change', () => {
                if (cb.checked) userSelected.add(id);
                else userSelected.delete(id);
                applyStateAndViews();
              });

              cb.checked = userSelected.has(id);
              label.appendChild(cb);
              label.appendChild(document.createTextNode(' ' + (p.name || p.id)));
              list.appendChild(label);
            });

            catWrap.appendChild(list);
            selector.appendChild(catWrap);
          });

          // 状態適用（親→子順の書き出し＋囲いビュー）
          function applyStateAndViews() {
            const closure = computeClosure(userSelected, idx);
            const ordered = topoFromRoots(Array.from(userSelected), depsOf, labelOf);

            // カテゴリ一覧の視覚状態（ユーザー指定=太字、非選択=薄）
            selector.querySelectorAll('input[type="checkbox"][data-pkg-id]').forEach(el => {
              const pid = el.dataset.pkgId;
              const isUser = userSelected.has(pid);
              const inClosure = closure.has(pid);
              const lab = el.closest('label');
              el.checked = inClosure;
              lab.classList.toggle('pkg-dim', !inClosure);
              lab.classList.toggle('pkg-user', isUser);
            });

            // 親子囲いビュー（親ボックス内に子をチップで表示）
            renderGroups(groups, Array.from(userSelected), depsOf, labelOf);

            // テキストエリアに親→子順で書き戻し（未知トークンは末尾維持）
            updateTextareaOrdered(textarea, ordered, labelOf, unknownTokens);
          }

          // 初期適用
          applyStateAndViews();
        })
        .catch(() => {
          selector.textContent = '(failed to load packages.json)';
        });
    });
  }

  if (document.readyState === 'complete' || document.readyState === 'interactive') {
    setTimeout(mount, 0);
  } else {
    document.addEventListener('DOMContentLoaded', mount, { once: true });
  }
})();

(function insertSetupShInputs() {
  function mount(fields) {
    const textarea = document.getElementById('uci-defaults-content');
    if (!textarea) return;

    const container = document.createElement('div');
    container.id = 'setup-sh-inputs';
    container.style.margin = '8px 0 12px';

    fields.forEach(f => {
      const label = document.createElement('label');
      label.textContent = f;
      label.style.display = 'block';
      label.style.marginTop = '4px';

      const input = document.createElement('input');
      input.type = 'text';
      input.name = f;
      input.style.width = '100%';
      input.dataset.setupField = f;

      container.appendChild(label);
      container.appendChild(input);
    });

    // ここを変更：textarea の「前」に挿入
    textarea.parentNode.insertBefore(container, textarea);
  }

  function parseSetupSh(content) {
    const result = [];
    content.split('\n').forEach(line => {
      const m = line.match(/^\s*([A-Za-z0-9_\-]+)=/);
      if (m) result.push(m[1]);
    });
    return result;
  }

  fetch('uci-defaults/setup.sh')
    .then(r => r.ok ? r.text() : '')
    .then(txt => {
      const fields = parseSetupSh(txt);
      if (fields.length) mount(fields);
    });
})();
