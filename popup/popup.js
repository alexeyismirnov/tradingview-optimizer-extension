// Popup action event types
const lockOptimizeButton = 'lockOptimizeButton'
const unlockOptimizeButton = 'unlockOptimizeButton'
const getParameterNames = 'getParameterNames'

let optimize = document.getElementById("optimize");
let addParameter = document.getElementById("addParameter");
let parameterLimit = 5;  // Fixed parameter limit

// Initialize popup html according to last user parameter count state
chrome.storage.local.get("userParameterCount", ({ userParameterCount }) => {
  for (let i = 1; i < userParameterCount; i++) {
    addParameterBlock(parameterLimit)
  }
  setLastUserParameters(userParameterCount)
  setTimeout(() => {
    // update iteration based on last user parameters
    calculateIterations()
  }, 150);
});

// Tab event listeners to change body width 
addTabEventListeners()

// Save Inputs EventListener for first parameters as default
addSaveInputEventListener(0)
addSaveAutoFillSelectionListener(0)

// Add start optimize event listener
optimize.addEventListener("click", async () => {
  let [tab] = await chrome.tabs.query({ active: true, currentWindow: true });

  var userInputs = new Object({
    parameters: [],
    timeFrames: [],
  })
  // err is handled as value
  var err = await CreateUserInputsMessage(userInputs)

  if (err != null) {
    if (err.message === 'missing-parameters') {
      chrome.runtime.sendMessage({
        notify: {
          type: "warning",
          content: "Fill all parameter inputs accordingly & Use dot '.' decimal separator"
        }
      });
    } else if (err.message === 'wrong-parameter-values') {
      chrome.runtime.sendMessage({
        notify: {
          type: "warning",
          content: "'Start' value must be less than 'End' value"
        }
      });
    }
    return
  }

  chrome.storage.local.set({ "userInputs": userInputs });

  chrome.scripting.executeScript({
    target: { tabId: tab.id },
    files: ['injector.js']
  });
});

// Message handling
chrome.runtime.onMessage.addListener((message, sender, reply) => {
  var properties = Object.keys(message)
  var values = Object.values(message)
  // popupAction type defines popup html UI actions according to event type
  if (properties[0] === 'popupAction') {
    var popupAction = values[0]
    switch (popupAction.event) {
      case lockOptimizeButton:
        document.querySelector("#optimize").setAttribute("disabled", "")
        break;
      case unlockOptimizeButton:
        document.querySelector("#optimize").removeAttribute("disabled", "")
        break;
      case getParameterNames:
        autoFillParameters(popupAction.message.parameterNames);
        break;
    }
  }
});

// Create Reports Table
createReportTable()

// Refresh Report Data Manually 
addRefreshDataEventListener()

//#region Report Tab & Table

async function createReportTable() {
  await sleep(200)

  chrome.storage.local.get(null, function (items) {
    var reportData = []

    if (items == null) {
      return
    }

    for (const [key, value] of Object.entries(items)) {
      if (key.startsWith("report-data-")) {
        var date = new Date(value.created)
        var formattedDate = (date.getMonth() + 1).toString() + '/' + date.getDate() + '/' + date.getFullYear() + ' ' + ("0" + date.getHours()).slice(-2) + ':' + ("0" + date.getMinutes()).slice(-2)
        var report = {
          "strategyID": value.strategyID,
          "strategyName": value.strategyName,
          "date": formattedDate,
          "symbol": value.symbol,
          "timePeriod": value.timePeriod,
          "parameters": value.parameters,
          "maxprofit": value.maxProfit,
          "detail": reportDetailHtml(value.strategyID)
        }
        reportData.push(report)
      }
    }
    var $table = $('#table')
    $table.bootstrapTable({ data: reportData })
    $table.bootstrapTable('load', reportData)
  });
}

function reportDetailHtml(strategyID) {
  return '<button id="report-detail-button" strategy-id="' + strategyID + '" type="button" class="btn btn-primary btn-sm"><i class="bi bi-clipboard2-data-fill"> Open</i></button>\
  <button id="remove-report" type="button" class="btn btn-danger btn-sm"><i class="bi bi-trash"></i></button>'
}

// Add Custom Styles to Columns 
function reportDetailButtonStyle(value, row, index) {
  return {
    css: {
      'text-align': 'center',
      'white-space': 'nowrap'
    }
  }
}

function maxProfitColumnStyle(value, row, index) {
  return {
    css: {
      'word-break': 'break-all'
    }
  }
}

function parametersColumnStyle(value, row, index) {
  return {
    css: {
      'word-break': 'break-word'
    }
  }
}

function symbolColumnStyle(value, row, index) {
  return {
    css: {
      'word-break': 'break-all'
    }
  }
}

function strategyNameColumnStyle(value, row, index) {
  return {
    css: {
      'word-break': 'break-word',
      'font-weight': '500'
    }
  }
}

window.openReportDetail = {
  // Set ReportDetail query string to build html report detail dynamically 
  'click #report-detail-button': function (e, value, row, index) {
    chrome.tabs.create({ url: 'report/reportdetail.html?strategyID=' + row.strategyID })
  },
  // Remove Report from both storage and table
  'click #remove-report': function (e, value, row, index) {
    var $table = $('#table')
    chrome.storage.local.remove(["report-data-" + row.strategyID])
    $table.bootstrapTable('remove', {
      field: 'strategyID',
      values: [row.strategyID]
    })
  }
}

//#endregion

// Add Parameter Button Event Listener
addParameter.addEventListener("click", async () => {
  addParameterBlock(parameterLimit);
});

// Add Save Parameters button event listener
document.getElementById("save-parameters").addEventListener("click", function() {
  // Get current parameters
  const parametersContainer = document.getElementById("parameters");
  const parameterCount = parametersContainer.children.length;
  
  let savedParameters = [];
  
  // Get parameters
  for (let i = 0; i < parameterCount; i++) {
    const row = parametersContainer.children[i];
    const inputStart = row.querySelector("#inputStart");
    const inputEnd = row.querySelector("#inputEnd");
    const inputStep = row.querySelector("#inputStep");
    const selectEl = row.querySelector("#selectAutoFill");
    
    if (inputStart && inputEnd && inputStep) {
      const startValue = inputStart.value;
      const endValue = inputEnd.value;
      const stepValue = inputStep.value;
      
      const parameterName = selectEl && selectEl.selectedIndex > 0 ? 
        selectEl.options[selectEl.selectedIndex].text : `Parameter ${i+1}`;
      
      if (startValue && endValue && stepValue) {
        savedParameters.push({
          parameterName,
          start: startValue,
          end: endValue,
          stepSize: stepValue
        });
      }
    }
  }
  
  // Save to storage
  chrome.storage.local.set({ "savedParameters": savedParameters }, () => {
    // Show success notification
    chrome.runtime.sendMessage({
      notify: {
        type: "success",
        content: "Parameters saved successfully"
      }
    });
  });
});

// Modified function to add parameter block with optional predefined values
function addParameterBlock(parameterLimit, predefinedValues = null) {
  var parameters = document.getElementById("parameters");
  var parameterCount = parameters.children.length;
  
  if (parameterCount < parameterLimit) {
    // Add Parameter Block
    var orderOfParameter = parameterCount + 1;
    var divToAppend = addParameterBlockHtml(orderOfParameter);
    parameters.insertAdjacentHTML('beforeend', divToAppend);
    
    // Get the newly added row
    const newRow = parameters.lastElementChild;
    
    // Get input elements
    const inputStart = newRow.querySelector("#inputStart");
    const inputEnd = newRow.querySelector("#inputEnd");
    const inputStep = newRow.querySelector("#inputStep");
    const selectEl = newRow.querySelector("#selectAutoFill");
    
    // If predefined values are provided, set them
    if (predefinedValues && inputStart && inputEnd && inputStep) {
      inputStart.value = predefinedValues.start || '';
      inputEnd.value = predefinedValues.end || '';
      inputStep.value = predefinedValues.stepSize || '';
      
      // Try to select the matching option in the dropdown if parameterName is provided
      if (predefinedValues.parameterName && selectEl) {
        for (let i = 0; i < selectEl.options.length; i++) {
          if (selectEl.options[i].text === predefinedValues.parameterName) {
            selectEl.selectedIndex = i;
            break;
          }
        }
      }
    }
    
    // Add event listeners to all input fields to recalculate iterations
    if (inputStart && inputEnd && inputStep) {
      // Add event listeners for both input and blur events
      inputStart.addEventListener("input", calculateIterations);
      inputStart.addEventListener("blur", function() {
        var start = "inputStart" + (parameterCount);
        var value = inputStart.value;
        chrome.storage.local.set({ [start]: value });
        calculateIterations();
      });
      
      inputEnd.addEventListener("input", calculateIterations);
      inputEnd.addEventListener("blur", function() {
        var end = "inputEnd" + (parameterCount);
        var value = inputEnd.value;
        chrome.storage.local.set({ [end]: value });
        calculateIterations();
      });
      
      inputStep.addEventListener("input", calculateIterations);
      inputStep.addEventListener("blur", function() {
        var step = "inputStep" + (parameterCount);
        var value = inputStep.value;
        chrome.storage.local.set({ [step]: value });
        calculateIterations();
      });
    }
    
    // Add Remove Button Listener
    var removeButton = newRow.querySelector(".btn-close.remove-parameters");
    
    // Check if the button exists before adding the event listener
    if (removeButton) {
      removeButton.addEventListener("click", () => {
        parameters.removeChild(newRow);
        
        // Update parameter count in storage
        chrome.storage.local.set({ "userParameterCount": parameters.children.length + 1 });
        
        // Recalculate iterations after removing a parameter
        calculateIterations();
      });
    } else {
      console.error("Remove button not found in the newly added parameter row");
    }
    
    // Update parameter count in storage
    chrome.storage.local.set({ "userParameterCount": parameters.children.length + 1 });
    
    // Calculate iterations after adding a new parameter
    calculateIterations();
  } else {
    chrome.runtime.sendMessage({
      notify: {
        type: "warning",
        content: "Parameter limit reached"
      }
    });
  }
}

// Load saved parameters
function loadSavedParameters() {
  chrome.storage.local.get("savedParameters", (result) => {
    const savedParameters = result.savedParameters;
    
    if (savedParameters && savedParameters.length > 0) {
      // Clear existing parameters
      const parametersContainer = document.getElementById("parameters");
      parametersContainer.innerHTML = '';
      
      // Add saved parameters
      for (const param of savedParameters) {
        if (parametersContainer.children.length < parameterLimit) {
          addParameterBlock(parameterLimit, param);
        }
      }
      
      // Calculate iterations after all parameters are loaded
      setTimeout(() => {
        calculateIterations();
      }, 100);
      
      // Show notification
      chrome.runtime.sendMessage({
        notify: {
          type: "info",
          content: "Loaded saved parameters"
        }
      });
    }
  });
}

// Add this to the appropriate initialization section
document.addEventListener('DOMContentLoaded', function() {
  // Load saved parameters after a short delay
  setTimeout(() => {
    loadSavedParameters();
  }, 500);
});

function addParameterBlockHtml(orderOfParameter) {
  return '<div class="row g-2 pb-2">\
    <div class="col-8">\
      <label for="inputStart" class="form-label">' + orderOfParameter + '. Parameter</label>\
      <select class="form-select-sm" aria-label="Select Parameter" id="selectAutoFill">\
      <option selected disabled>Select Parameter</option>\
    </select>\
      <div class="input-group input-group">\
        <input type="text" aria-label="Start" placeholder="Start" class="form-control" id="inputStart">\
        <input type="text" aria-label="End" placeholder="End" class="form-control" id="inputEnd">\
      </div>\
    </div>\
    <div class="col-4 mt-auto">\
      <div class="text-end" id="remove' + orderOfParameter + '">\
        <label for="close" class="form-label text-muted">Remove</label>\
        <button type="button" class="btn-close align-text-top remove-parameters" aria-label="Close"></button>\
      </div>\
      <input type="text" aria-label="Step" placeholder="Step" class="form-control"\
        id="inputStep">\
    </div>\
  </div>'
}

function addRemoveParameterBlockEventListener(parameterCount) {
  document.querySelectorAll(".btn-close.remove-parameters")[parameterCount - 1].addEventListener("click", async (evt) => {
    // Remove the selected row from incoming event 
    var evtPath = eventPath(evt)
    for (let i = 0; i < evtPath.length; i++) {
      const element = evtPath[i];
      if (element.className == "row g-2 pb-2") {
        element.remove()
        break;
      }
    }

    var parameters = document.getElementById("parameters")
    var parameterCount = parameters.children.length

    // Decrement User's Last Parameter Count State    
    chrome.storage.local.set({ "userParameterCount": parameterCount });
    //Clear user parameter values from storage
    var start = "inputStart" + parameterCount
    var end = "inputEnd" + parameterCount
    var step = "inputStep" + parameterCount
    var autoFill = "selectAutoFill" + parameterCount
    chrome.storage.local.set({ [start]: null, [end]: null, [step]: null, [autoFill]: null });


    //Show previously added hidden remove button
    if (parameterCount > 1) {
      var removeDiv = "#remove" + parameterCount + ""
      parameters.lastElementChild.querySelector(removeDiv).style = 'display:block;'
    }
    calculateIterations()
  });
}

// Retrieve and set user parameters from last saved state
function setLastUserParameters(parameterCount) {
  for (let i = 0; i < parameterCount; i++) {
    chrome.storage.local.get(["inputStart" + i], function (result) {
      var userValue = null
      if (result["inputStart" + i]) {
        userValue = result["inputStart" + i]
      }
      document.querySelectorAll("#inputStart")[i].value = userValue
    });

    chrome.storage.local.get(["inputEnd" + i], function (result) {
      var userValue = null
      if (result["inputEnd" + i]) {
        userValue = result["inputEnd" + i]
      }
      document.querySelectorAll("#inputEnd")[i].value = userValue
    });

    chrome.storage.local.get(["inputStep" + i], function (result) {
      var userValue = null
      if (result["inputStep" + i]) {
        userValue = result["inputStep" + i]
      }
      document.querySelectorAll("#inputStep")[i].value = userValue
    });
  }
}

// Save last user inputs to storage as state
function addSaveInputEventListener(parameterCount) {
  document.querySelectorAll("#inputStart")[parameterCount].addEventListener("blur", function (e) {
    var start = "inputStart" + parameterCount
    var value = document.querySelectorAll("#inputStart")[parameterCount].value
    chrome.storage.local.set({ [start]: value });
    calculateIterations()
  });
  document.querySelectorAll("#inputEnd")[parameterCount].addEventListener("blur", function (e) {
    var end = "inputEnd" + parameterCount
    var value = document.querySelectorAll("#inputEnd")[parameterCount].value
    chrome.storage.local.set({ [end]: value });
    calculateIterations()
  });
  document.querySelectorAll("#inputStep")[parameterCount].addEventListener("blur", function (e) {
    var step = "inputStep" + parameterCount
    var value = document.querySelectorAll("#inputStep")[parameterCount].value
    chrome.storage.local.set({ [step]: value });
    calculateIterations()
  });
}

// Save last user selected auto-fill selection as state
function addSaveAutoFillSelectionListener(parameterCount) {
  document.querySelectorAll("#selectAutoFill")[parameterCount].addEventListener("change", (event) => {
    var key = "selectAutoFill" + parameterCount
    var value = event.target.value
    chrome.storage.local.set({ [key]: value });
  });
}

// Dynamically change html body size 
function addTabEventListeners() {
  document.querySelector("#reports-tab").addEventListener("click", function () {
    document.body.style.width = '720px'
  })

  document.querySelector("#home-tab").addEventListener("click", function () {
    document.body.style.width = '560px'
  })
  
  document.querySelector("#favs-tab").addEventListener("click", function () {
    document.body.style.width = '720px';
  })
}

// Refresh table data with refresh button
function addRefreshDataEventListener() {
  document.querySelector("#refresh").addEventListener("click", function () {
    createReportTable()
  })
}

function calculateIterations() {
  var totalIterations = 1
  var isIterationValid = false
  var parameters = document.getElementById("parameters")
  var parameterCount = parameters.children.length

  var iterationValue = document.querySelector("#value")

  for (let i = 0; i < parameterCount; i++) {
    var inputStart = parameters.children[i].querySelector("#inputStart").value.trim()
    var inputEnd = parameters.children[i].querySelector("#inputEnd").value.trim()
    var inputStep = parameters.children[i].querySelector("#inputStep").value.trim()

    var err = validateParameterValues(inputStart, inputEnd, inputStep)
    if (err != null) {
      isIterationValid = false
      break
    }

    let start = parseFloat(inputStart)
    let end = parseFloat(inputEnd)
    
    // If start equals end, this parameter has only 1 possible value
    if (start === end) {
      // Multiply by 1 (no change to total iterations)
      totalIterations *= 1
    } else {
      let difference = end - start
      if (isDivisible(difference, inputStep)) {
        totalIterations *= (difference / inputStep) + 1
      } else {
        totalIterations *= customCeil((difference / inputStep)) + 1
      }
    }

    isIterationValid = true
  };

  if (isIterationValid) {
    iterationValue.innerText = totalIterations
  } else {
    iterationValue.innerText = "-"
  }
}

// Create user inputs message, return err.message if validation fails 
async function CreateUserInputsMessage(userInputs) {
  var parameters = document.getElementById("parameters")

  var parameterCount = parameters.children.length
  var firstAutoFillOptions = parameters.children[0].querySelector("#selectAutoFill").options.length

  var parameterNamesObj = await chrome.storage.local.get("parameterNames")

  for (let i = 0; i < parameterCount; i++) {
    var inputStart = parameters.children[i].querySelector("#inputStart").value
    var inputEnd = parameters.children[i].querySelector("#inputEnd").value
    var inputStep = parameters.children[i].querySelector("#inputStep").value
    var index = parameters.children[i].querySelector("#selectAutoFill").selectedIndex - 1
    var parameterName = parameters.children[i].querySelector("#selectAutoFill").selectedOptions[0].innerText


    var err = validateParameterValues(inputStart, inputEnd, inputStep)
    if (err != null) {
      return err
    }

    // no selection for parameter name, autofill parameter name in order
    if (index == -1 && firstAutoFillOptions > 1) {
      parameterName = parameterNamesObj?.parameterNames[i]
    }

    // autoFill feature is not active
    if (firstAutoFillOptions <= 1) {
      parameterName = null
    }

    userInputs.parameters.push({ start: inputStart, end: inputEnd, stepSize: inputStep, parameterIndex: index, parameterName: parameterName })
  }

  return null
}

function autoFillParameters(parameterNames) {
  if (parameterNames.length < 1) {
    chrome.storage.local.set({ "parameterNames": null });
    return
  }
  // hide labels, show selectors
  var labels = document.querySelectorAll('label[for="inputStart"]')
  labels.forEach(label => {
    label.style.display = 'none'
  });

  var autoFillSelects = document.querySelectorAll("#selectAutoFill")
  for (let i = 0; i < autoFillSelects.length; i++) {
    const autoFillSelect = autoFillSelects[i];
    if (autoFillSelect.options.length > 1) {
      continue;
    }
    autoFillSelect.style.display = 'inline-block'
    for (var j = 0; j < parameterNames.length; j++) {
      var parameterName = parameterNames[j];
      var parameterNameIndex = j;
      let option = new Option(parameterName, parameterNameIndex);
      autoFillSelect.add(option);
    }

    chrome.storage.local.get(["selectAutoFill" + i], function (result) {
      var userValue = i
      if (result["selectAutoFill" + i] && result["selectAutoFill" + i] <= parameterNames.length - 1) {
        userValue = result["selectAutoFill" + i]
      }
      autoFillSelect.value = userValue
    });
  }
  chrome.storage.local.set({ "parameterNames": parameterNames });
}

//#region Helpers 

function isNumeric(str) {
  if (typeof str != "string") {
    return false
  }
  return !isNaN(str) &&
    !isNaN(parseFloat(str))
}

function validateParameterValues(inputStart, inputEnd, inputStep) {
  if (!isNumeric(inputStart) || !isNumeric(inputEnd) || !isNumeric(inputStep)) {
    return new Error("missing-parameters")
  }

  var start = parseFloat(inputStart)
  var end = parseFloat(inputEnd)
  var step = parseFloat(inputStep)

  // Allow start to equal end (treat as a fixed parameter)
  if (start > end || step <= 0) {
    return new Error("wrong-parameter-values")
  }

  return null
}

function isDivisible(a, b) {
  if (b === 0) {
    return false;
  }
  return a % b === 0;
}

// customCeil to mitigate js floating arithmetic problem
function customCeil(value, precision = 5) {
  const rounded = Math.round(value * precision) / precision;
  return Number.isInteger(rounded) ? rounded : Math.ceil(rounded);
}

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

function dateSorter(a, b) {
  var aa = new Date(a)
  var bb = new Date(b)
  return aa - bb
}

// Reference: https://stackoverflow.com/questions/39245488/event-path-is-undefined-running-in-firefox
function eventPath(evt) {
  var path = (evt.composedPath && evt.composedPath()) || evt.path,
    target = evt.target;

  if (path != null) {
    // Safari doesn't include Window, but it should.
    return (path.indexOf(window) < 0) ? path.concat(window) : path;
  }

  if (target === window) {
    return [window];
  }

  function getParents(node, memo) {
    memo = memo || [];
    var parentNode = node.parentNode;

    if (!parentNode) {
      return memo;
    }
    else {
      return getParents(parentNode, memo.concat(parentNode));
    }
  }

  return [target].concat(getParents(target), window);
}