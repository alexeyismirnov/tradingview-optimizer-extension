// Define table events first
window.favsTableEvents = {
    'click .select-symbol': function (e, value, row, index) {
      chrome.storage.local.get("favoriteSymbols", async (result) => {
        const favorites = result.favoriteSymbols || [];
        const favorite = favorites.find(fav => fav.id === row.id);
        if (favorite) {
          const success = await selectSymbol(favorite.symbol, favorite.exchange, favorite.parameters);
          if (success) {
            chrome.runtime.sendMessage({
              notify: {
                type: "success",
                content: `Symbol ${favorite.symbol} selected`
              }
            });
          } else {
            chrome.runtime.sendMessage({
              notify: {
                type: "error",
                content: "Failed to select symbol"
              }
            });
          }
        }
      });
    },
    'click .delete-symbol': function (e, value, row, index) {
      if (confirm("Are you sure you want to delete this symbol from favorites?")) {
        deleteFavoriteSymbol(row.id);
      }
    }
  };
  
  // Create and initialize favorites table
  function createFavsTable() {
    var $table = $('#favs-table');
    $table.bootstrapTable({
      data: [],
      columns: [
        {
          field: 'symbol',
          title: 'Symbol',
          sortable: true
        },
        {
          field: 'exchange',
          title: 'Exchange',
          sortable: true
        },
        {
          field: 'parameters',
          title: 'Parameters',
          sortable: false,
          cellStyle: function(value, row, index) {
            return {
              css: {
                'word-break': 'break-word',
                'max-width': '300px',
                'white-space': 'normal'
              }
            }
          }
        },
        {
          field: 'actions',
          title: 'Actions',
          events: window.favsTableEvents,
          formatter: function(value, row, index) {
            return `
              <button class="btn btn-sm btn-primary fav-actions-btn select-symbol" title="Select in TradingView">
                <i class="bi bi-check-circle"></i>
              </button>
              <button class="btn btn-sm btn-danger fav-actions-btn delete-symbol" title="Delete">
                <i class="bi bi-trash"></i>
              </button>
            `;
          }
        }
      ],
      formatNoMatches: function() {
        return "No favorite symbols saved yet";
      }
    });
  }
  
  // Initialize favorites table after document is ready
  $(document).ready(function() {
    createFavsTable();
  });
  
  // Add tab event listener for Favs tab
  document.querySelector("#favs-tab").addEventListener("click", function () {
    document.body.style.width = '720px';
    refreshFavsTable();
  });
  
  // Clear search button functionality
  document.querySelector("#clear-favs-search").addEventListener("click", function() {
    document.querySelector("#favs-search").value = '';
    $('#favs-table').bootstrapTable('resetSearch');
  });
  
  // Get current symbol and parameters from TradingView
  document.querySelector("#save-current-symbol").addEventListener("click", async function() {
    // First get the current symbol
    const symbolInfo = await getCurrentSymbol();
    
    if (symbolInfo) {
      document.querySelector("#fav-symbol").value = symbolInfo.symbol || '';
      document.querySelector("#fav-exchange").value = symbolInfo.exchange || '';
      
      // Show loading indicator
      const parametersInput = document.querySelector("#fav-parameters");
      parametersInput.value = "Loading parameters...";
      parametersInput.disabled = true;
      
      // Then get the current parameters from TradingView
      const result = await getCurrentParameters();
      
      if (result.error) {
        parametersInput.value = `Error: ${result.error}`;
        chrome.runtime.sendMessage({
          notify: {
            type: "error",
            content: `Failed to get parameters: ${result.error}`
          }
        });
      } else if (result.parameters && result.parameters.length > 0) {
        // Format parameters as comma-separated values
        const paramValues = result.parameters.map(p => p.value).join(', ');
        parametersInput.value = paramValues;
        
        chrome.runtime.sendMessage({
          notify: {
            type: "success",
            content: `Retrieved ${result.parameters.length} parameters`
          }
        });
      } else {
        parametersInput.value = '';
        chrome.runtime.sendMessage({
          notify: {
            type: "warning",
            content: "No parameters found"
          }
        });
      }
      
      parametersInput.disabled = false;
    }
  });
  
  // Add new favorite form submission
  document.querySelector("#add-fav-form").addEventListener("submit", function(e) {
    e.preventDefault();
    
    const symbol = document.querySelector("#fav-symbol").value;
    const exchange = document.querySelector("#fav-exchange").value;
    const parameters = document.querySelector("#fav-parameters").value;
    
    if (!symbol) {
      chrome.runtime.sendMessage({
        notify: {
          type: "warning",
          content: "Please enter a symbol"
        }
      });
      return;
    }
    
    // Create favorite object
    const favorite = {
      id: Date.now(),
      symbol: symbol.toUpperCase(),
      exchange: exchange || '',
      parameters: parameters || '',
      created: new Date().toISOString()
    };
    
    // Save to storage and refresh table
    chrome.storage.local.get("favoriteSymbols", (result) => {
      const favorites = result.favoriteSymbols || [];
      favorites.push(favorite);
      
      chrome.storage.local.set({ "favoriteSymbols": favorites }, () => {
        // Reset form
        document.querySelector("#add-fav-form").reset();
        
        // Refresh the table with the updated data
        refreshFavsTable();
        
        chrome.runtime.sendMessage({
          notify: {
            type: "success",
            content: "Symbol added to favorites"
          }
        });
      });
    });
  });
  
  // Get parameter count from Home tab
  async function getParameterCount() {
    const parameters = document.getElementById("parameters");
    return parameters ? parameters.children.length : 0;
  }
  
  // Helper functions for TradingView interaction - extracted to avoid duplication
  // Check if Strategy Tester is already open
  function checkIfStrategyTesterIsOpenScript() {
    // Check if there's a button with "Close Strategy Tester" aria-label
    const closeButton = document.querySelector('button[aria-label="Close Strategy Tester"]');
    if (closeButton) return true;
    
    // Check if the strategy tester panel is visible
    const strategyTesterPanel = document.querySelector('.bottom-widgetbar-content.backtesting');
    if (strategyTesterPanel && strategyTesterPanel.offsetHeight > 0) return true;
    
    // Check for other indicators that the strategy tester is open
    const strategyControls = document.querySelector('.chart-bottom-panel');
    if (strategyControls && strategyControls.offsetHeight > 0) return true;
    
    return false;
  }
  
  // Find the Strategy Tester button
  function findStrategyTesterButtonScript() {
    // Try various selectors to find the Strategy Tester button
    const selectors = [
      'button[aria-label="Open Strategy Tester"]',
      'button.tv-chart-toolbar__button--strategy-tester',
      'button[data-name="strategy-tester-button"]',
      'button[data-tooltip="Strategy Tester"]'
    ];
    
    for (const selector of selectors) {
      const button = document.querySelector(selector);
      if (button) return button;
    }
    
    // Try by content
    const buttonsByContent = [...document.querySelectorAll('button')].find(el => 
      el.textContent.includes('Strategy Tester') || 
      el.innerHTML.includes('strategy-tester')
    );
    
    if (buttonsByContent) return buttonsByContent;
    
    // Try buttons in the bottom panel
    const bottomPanelButtons = [...document.querySelectorAll('.bottom-widgetbar-content button, .chart-bottom-panel button')].find(el => 
      el.textContent.includes('Strategy') || 
      el.innerHTML.includes('strategy')
    );
    
    return bottomPanelButtons || null;
  }
  
  // Open settings with keyboard shortcut (Command+P or Ctrl+P)
  function openSettingsWithKeyboardShortcutScript() {
    // Focus on the chart area first to ensure keyboard events are captured
    const chartArea = document.querySelector('.chart-container') || 
                     document.querySelector('.chart-markup-table') ||
                     document.querySelector('.chart-gui-wrapper');
    
    if (chartArea) {
      chartArea.focus();
    }
    
    // Detect OS to use the right modifier key
    const isMac = navigator.platform.toUpperCase().indexOf('MAC') >= 0;
    const modifierKey = isMac ? 'metaKey' : 'ctrlKey'; // metaKey is Command on Mac
    
    // Create and dispatch keydown event for Command+P (Mac) or Ctrl+P (Windows/Linux)
    const keyEvent = new KeyboardEvent('keydown', {
      key: 'p',
      code: 'KeyP',
      keyCode: 80,
      which: 80,
      [modifierKey]: true, // Set the appropriate modifier key
      bubbles: true
    });
    
    // Dispatch the event to the document
    document.dispatchEvent(keyEvent);
    console.log(`Sent ${isMac ? 'Command+P' : 'Ctrl+P'} keyboard shortcut`);
    
    return true;
  }
  
  // Change TradingView input value
  function changeTvInputScript(input, value) {
    const event = new Event('input', { bubbles: true });
    const previousValue = input.value;
    
    input.value = value;
    
    // Only use valueTracker if it exists (it's a React internal)
    if (input._valueTracker) {
      input._valueTracker.setValue(previousValue);
    }
    
    input.dispatchEvent(event);
    
    // Also dispatch change event
    input.dispatchEvent(new Event('change', { bubbles: true }));
  }
  
  // Find the OK button in the dialog
  function findOkButtonScript() {
    // Try different methods to find the OK button
    const buttonSelectors = [
      'button[name="submit"]',
      'button[data-name="submit"]',
      'button.tv-button--primary',
      'button.submit-button',
      'button.ok-button',
      'button.apply-button'
    ];
    
    for (const selector of buttonSelectors) {
      const button = document.querySelector(selector);
      if (button) return button;
    }
    
    // Try to find by text content
    const allButtons = document.querySelectorAll('button');
    for (const button of allButtons) {
      const text = button.textContent.toLowerCase();
      if (text === 'ok' || text === 'apply' || text === 'save') {
        return button;
      }
    }
    
    return null;
  }
  
  // Find the Cancel button
  function findCancelButtonScript() {
    const buttonSelectors = [
      'button[name="cancel"]',
      'button[data-name="cancel-button"]',
      'button.cancel-button',
      'button.tv-button--secondary'
    ];
    
    for (const selector of buttonSelectors) {
      const button = document.querySelector(selector);
      if (button) return button;
    }
    
    // Try to find by text content
    const allButtons = document.querySelectorAll('button');
    for (const button of allButtons) {
      const text = button.textContent.toLowerCase();
      if (text === 'cancel' || text === 'close') {
        return button;
      }
    }
    
    return null;
  }
  
  // Get current symbol from TradingView
  async function getCurrentSymbol() {
    try {
      const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
      return new Promise((resolve) => {
        chrome.scripting.executeScript({
          target: { tabId: tab.id },
          func: () => {
            const symbolElement = document.querySelector("#header-toolbar-symbol-search");
            if (!symbolElement) return null;
            
            const symbol = symbolElement.textContent.trim();
            const title = document.querySelector("title")?.innerText || '';
            
            // Try to extract exchange from title
            let exchange = '';
            
            if (title) {
              const parts = title.split(':');
              if (parts.length > 1) {
                exchange = parts[0].trim();
              }
            }
            
            return { symbol, exchange };
          }
        }, (results) => {
          if (results && results[0] && results[0].result) {
            resolve(results[0].result);
          } else {
            resolve(null);
          }
        });
      });
    } catch (error) {
      console.error("Error getting current symbol:", error);
      return null;
    }
  }
  
    // Get current parameters directly from TradingView strategy settings
async function getCurrentParameters() {
    try {
      const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
      const parameterCount = await getParameterCount();
      
      return new Promise((resolve) => {
        chrome.scripting.executeScript({
          target: { tabId: tab.id },
          func: (count) => {
            // First check if Strategy Tester is open
            const isStrategyTesterOpen = checkIfStrategyTesterIsOpen();
            if (!isStrategyTesterOpen) {
              // If Strategy Tester is not open, try to open it
              const strategyTesterButton = findStrategyTesterButton();
              if (strategyTesterButton) {
                strategyTesterButton.click();
                // Wait for it to open
                return { needToOpenTester: true, parameterCount: count };
              } else {
                return { error: "Strategy Tester not found" };
              }
            }
            
            // Now open settings to get parameters
            openSettingsWithKeyboardShortcut();
            
            // Return control to the extension to continue in the callback
            return { openedSettings: true, parameterCount: count };
            
            // Helper functions (defined in the same scope for execution in the page context)
            function checkIfStrategyTesterIsOpen() {
              // Check if there's a button with "Close Strategy Tester" aria-label
              const closeButton = document.querySelector('button[aria-label="Close Strategy Tester"]');
              if (closeButton) return true;
              
              // Check if the strategy tester panel is visible
              const strategyTesterPanel = document.querySelector('.bottom-widgetbar-content.backtesting');
              if (strategyTesterPanel && strategyTesterPanel.offsetHeight > 0) return true;
              
              // Check for other indicators that the strategy tester is open
              const strategyControls = document.querySelector('.chart-bottom-panel');
              if (strategyControls && strategyControls.offsetHeight > 0) return true;
              
              return false;
            }
            
            function findStrategyTesterButton() {
              // Try various selectors to find the Strategy Tester button
              const selectors = [
                'button[aria-label="Open Strategy Tester"]',
                'button.tv-chart-toolbar__button--strategy-tester',
                'button[data-name="strategy-tester-button"]',
                'button[data-tooltip="Strategy Tester"]'
              ];
              
              for (const selector of selectors) {
                const button = document.querySelector(selector);
                if (button) return button;
              }
              
              // Try by content
              const buttonsByContent = [...document.querySelectorAll('button')].find(el => 
                el.textContent.includes('Strategy Tester') || 
                el.innerHTML.includes('strategy-tester')
              );
              
              if (buttonsByContent) return buttonsByContent;
              
              // Try buttons in the bottom panel
              const bottomPanelButtons = [...document.querySelectorAll('.bottom-widgetbar-content button, .chart-bottom-panel button')].find(el => 
                el.textContent.includes('Strategy') || 
                el.innerHTML.includes('strategy')
              );
              
              return bottomPanelButtons || null;
            }
            
            function openSettingsWithKeyboardShortcut() {
              // Focus on the chart area first to ensure keyboard events are captured
              const chartArea = document.querySelector('.chart-container') || 
                               document.querySelector('.chart-markup-table') ||
                               document.querySelector('.chart-gui-wrapper');
              
              if (chartArea) {
                chartArea.focus();
              }
              
              // Detect OS to use the right modifier key
              const isMac = navigator.platform.toUpperCase().indexOf('MAC') >= 0;
              const modifierKey = isMac ? 'metaKey' : 'ctrlKey'; // metaKey is Command on Mac
              
              // Create and dispatch keydown event for Command+P (Mac) or Ctrl+P (Windows/Linux)
              const keyEvent = new KeyboardEvent('keydown', {
                key: 'p',
                code: 'KeyP',
                keyCode: 80,
                which: 80,
                [modifierKey]: true, // Set the appropriate modifier key
                bubbles: true
              });
              
              // Dispatch the event to the document
              document.dispatchEvent(keyEvent);
              console.log(`Sent ${isMac ? 'Command+P' : 'Ctrl+P'} keyboard shortcut`);
              
              return true;
            }
          },
          args: [parameterCount]
        }, async (results) => {
          if (!results || !results[0] || !results[0].result) {
            resolve({ parameters: [] });
            return;
          }
          
          const result = results[0].result;
          
          if (result.error) {
            resolve({ parameters: [], error: result.error });
            return;
          }
          
          if (result.needToOpenTester) {
            // Wait for strategy tester to open
            await new Promise(r => setTimeout(r, 1000));
            // Try again
            const params = await getCurrentParameters();
            resolve(params);
            return;
          }
          
          if (result.openedSettings) {
            // Wait for settings dialog to open
            await new Promise(r => setTimeout(r, 1000));
            
            // Now read the parameter values
            chrome.scripting.executeScript({
              target: { tabId: tab.id },
              func: (expectedCount) => {
                // Find numeric input fields in the settings dialog
                const inputFields = document.querySelectorAll("div[data-name='indicator-properties-dialog'] input[inputmode='numeric']");
                
                let parameterValues = [];
                
                if (inputFields.length === 0) {
                  // Try alternative selectors
                  const alternativeInputs = document.querySelectorAll("div.js-dialog input[type='text'], div.js-dialog input[type='number'], div.tv-dialog input[type='text'], div.tv-dialog input[type='number']");
                  
                  if (alternativeInputs.length > 0) {
                    // Get values from input fields
                    for (let i = 0; i < alternativeInputs.length; i++) {
                      parameterValues.push(alternativeInputs[i].value);
                    }
                  }
                } else {
                  // Get values from input fields
                  for (let i = 0; i < inputFields.length; i++) {
                    parameterValues.push(inputFields[i].value);
                  }
                }
                
                // Get parameter names if possible
                const parameterLabels = [];
                const labels = document.querySelectorAll("div[data-name='indicator-properties-dialog'] label, div.js-dialog label, div.tv-dialog label");
                
                for (let i = 0; i < labels.length; i++) {
                  const labelText = labels[i].textContent.trim();
                  if (labelText) {
                    parameterLabels.push(labelText);
                  }
                }
                
                // Close the dialog by clicking Cancel to avoid changes
                const cancelButton = document.querySelector("button[data-name='cancel-button' i]") || 
                                    document.querySelector("span[class*='cancel' i] button") ||
                                    findCancelButton();
                
                if (cancelButton) {
                  cancelButton.click();
                }
                
                return {
                  parameterValues,
                  parameterLabels,
                  expectedCount
                };
                
                // Helper function to find the Cancel button
                function findCancelButton() {
                  const buttonSelectors = [
                    'button[name="cancel"]',
                    'button.cancel-button',
                    'button.tv-button--secondary'
                  ];
                  
                  for (const selector of buttonSelectors) {
                    const button = document.querySelector(selector);
                    if (button) return button;
                  }
                  
                  // Try to find by text content
                  const allButtons = document.querySelectorAll('button');
                  for (const button of allButtons) {
                    const text = button.textContent.toLowerCase();
                    if (text === 'cancel' || text === 'close') {
                      return button;
                    }
                  }
                  
                  return null;
                }
              },
              args: [result.parameterCount]
            }, (paramResults) => {
              if (!paramResults || !paramResults[0] || !paramResults[0].result) {
                resolve({ parameters: [] });
                return;
              }
              
              const { parameterValues, parameterLabels, expectedCount } = paramResults[0].result;
              
              // Format parameters for display
              const parameters = [];
              
              // Only include as many parameters as we have in the Home tab
              const numToInclude = Math.min(parameterValues.length, expectedCount);
              
              for (let i = 0; i < numToInclude; i++) {
                parameters.push({
                  name: parameterLabels[i] || `Parameter ${i+1}`,
                  value: parameterValues[i]
                });
              }
              
              resolve({ parameters });
            });
          } else {
            resolve({ parameters: [] });
          }
        });
      });
    } catch (error) {
      console.error("Error getting current parameters:", error);
      return { parameters: [], error: error.message };
    }
  }
  
  // Select symbol in TradingView and apply parameters
  async function selectSymbol(symbol, exchange, parametersStr) {
    try {
      const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
      
      // Parse parameters from string
      let parameterValues = [];
      if (parametersStr && parametersStr.trim()) {
        parameterValues = parametersStr.split(',').map(val => val.trim());
      }
      
      // If no parameters in favorite, try to get current parameters
      if (parameterValues.length === 0) {
        const result = await getCurrentParameters();
        if (result.parameters && result.parameters.length > 0) {
          parameterValues = result.parameters.map(p => p.value);
        }
      }
      
      chrome.scripting.executeScript({
        target: { tabId: tab.id },
        func: (data) => {
          const { symbolData, parameterValues } = data;
          console.log("Parameters to set:", parameterValues);
          
          // Click on the symbol search button
          const symbolButton = document.querySelector("#header-toolbar-symbol-search");
          if (!symbolButton) return false;
          
          symbolButton.click();
          
          // Wait for the search input to appear and then set its value
          setTimeout(() => {
            const searchInput = document.querySelector("input[data-role='search']");
            if (!searchInput) return false;
            
            // Clear the input
            searchInput.value = '';
            
            // Create and dispatch events to simulate typing
            searchInput.focus();
            
            // Set the value and dispatch input event
            searchInput.value = symbolData.exchange ? 
              `${symbolData.exchange}:${symbolData.symbol}` : 
              symbolData.symbol;
            
            searchInput.dispatchEvent(new Event('input', { bubbles: true }));
            
            // Wait for search results and click the first one
            setTimeout(() => {
              const firstResult = document.querySelector("[data-role='list-item']");
              if (firstResult) {
                firstResult.click();
                
                // Wait for chart to load and then open strategy tester
                setTimeout(() => {
                  // Check if Strategy Tester is already open
                  const isStrategyTesterOpen = checkIfStrategyTesterIsOpen();
                  
                  if (isStrategyTesterOpen) {
                    console.log("Strategy Tester is already open, proceeding to settings");
                    // Directly open settings with keyboard shortcut
                    setTimeout(() => {
                      openSettingsWithKeyboardShortcut();
                      
                      // Wait for settings dialog to open, then set parameters
                      setTimeout(() => {
                        setParametersInSettingsDialog(parameterValues);
                      }, 1000);
                    }, 500);
                  } else {
                    // Find Strategy Tester button using aria-label
                    const strategyTesterButton = findStrategyTesterButton();
                    
                    if (strategyTesterButton) {
                      console.log("Strategy Tester button found, clicking to open");
                      strategyTesterButton.click();
                      
                      // Wait for Strategy Tester panel to open, then open settings with keyboard shortcut
                      setTimeout(() => {
                        // Use keyboard shortcut to open settings
                        openSettingsWithKeyboardShortcut();
                        
                        // Wait for settings dialog to open, then set parameters
                        setTimeout(() => {
                          setParametersInSettingsDialog(parameterValues);
                        }, 1000);
                      }, 1000);
                    } else {
                      console.log("Could not find Strategy Tester button with any method");
                    }
                  }
                }, 2000); // Wait 2 seconds for chart to fully load
              } else {
                // If no results found, press Enter
                searchInput.dispatchEvent(new KeyboardEvent('keydown', {
                  key: 'Enter',
                  code: 'Enter',
                  keyCode: 13,
                  which: 13,
                  bubbles: true
                }));
              }
            }, 500);
          }, 300);
          
          return true;
          
          // Helper functions (defined in the same scope for execution in the page context)
          function checkIfStrategyTesterIsOpen() {
            // Check if there's a button with "Close Strategy Tester" aria-label
            const closeButton = document.querySelector('button[aria-label="Close Strategy Tester"]');
            if (closeButton) return true;
            
            // Check if the strategy tester panel is visible
            const strategyTesterPanel = document.querySelector('.bottom-widgetbar-content.backtesting');
            if (strategyTesterPanel && strategyTesterPanel.offsetHeight > 0) return true;
            
            // Check for other indicators that the strategy tester is open
            const strategyControls = document.querySelector('.chart-bottom-panel');
            if (strategyControls && strategyControls.offsetHeight > 0) return true;
            
            return false;
          }
          
          function findStrategyTesterButton() {
            // Try various selectors to find the Strategy Tester button
            const selectors = [
              'button[aria-label="Open Strategy Tester"]',
              'button.tv-chart-toolbar__button--strategy-tester',
              'button[data-name="strategy-tester-button"]',
              'button[data-tooltip="Strategy Tester"]'
            ];
            
            for (const selector of selectors) {
              const button = document.querySelector(selector);
              if (button) return button;
            }
            
            // Try by content
            const buttonsByContent = [...document.querySelectorAll('button')].find(el => 
              el.textContent.includes('Strategy Tester') || 
              el.innerHTML.includes('strategy-tester')
            );
            
            if (buttonsByContent) return buttonsByContent;
            
            // Try buttons in the bottom panel
            const bottomPanelButtons = [...document.querySelectorAll('.bottom-widgetbar-content button, .chart-bottom-panel button')].find(el => 
              el.textContent.includes('Strategy') || 
              el.innerHTML.includes('strategy')
            );
            
            return bottomPanelButtons || null;
          }
          
          function openSettingsWithKeyboardShortcut() {
            // Focus on the chart area first to ensure keyboard events are captured
            const chartArea = document.querySelector('.chart-container') || 
                             document.querySelector('.chart-markup-table') ||
                             document.querySelector('.chart-gui-wrapper');
            
            if (chartArea) {
              chartArea.focus();
            }
            
            // Detect OS to use the right modifier key
            const isMac = navigator.platform.toUpperCase().indexOf('MAC') >= 0;
            const modifierKey = isMac ? 'metaKey' : 'ctrlKey'; // metaKey is Command on Mac
            
            // Create and dispatch keydown event for Command+P (Mac) or Ctrl+P (Windows/Linux)
            const keyEvent = new KeyboardEvent('keydown', {
              key: 'p',
              code: 'KeyP',
              keyCode: 80,
              which: 80,
              [modifierKey]: true, // Set the appropriate modifier key
              bubbles: true
            });
            
            // Dispatch the event to the document
            document.dispatchEvent(keyEvent);
            console.log(`Sent ${isMac ? 'Command+P' : 'Ctrl+P'} keyboard shortcut`);
            
            return true;
          }
          
          function setParametersInSettingsDialog(parameterValues) {
            console.log("Attempting to set parameters in settings dialog");
            
            // Use the same selector as in the optimization process
            const inputFields = document.querySelectorAll("div[data-name='indicator-properties-dialog'] input[inputmode='numeric']");
            
            if (inputFields.length === 0) {
              console.log("No numeric input fields found with optimization selector, trying alternative selectors");
              
              // Try alternative selectors
              const alternativeInputs = document.querySelectorAll("div.js-dialog input[type='text'], div.js-dialog input[type='number'], div.tv-dialog input[type='text'], div.tv-dialog input[type='number']");
              
              if (alternativeInputs.length > 0) {
                console.log(`Found ${alternativeInputs.length} input fields with alternative selector`);
                
                // Apply parameters sequentially
                for (let i = 0; i < Math.min(parameterValues.length, alternativeInputs.length); i++) {
                  const inputField = alternativeInputs[i];
                  const value = parameterValues[i];
                  
                  // Use the ChangeTvInput approach
                  changeTvInput(inputField, value);
                  console.log(`Set input field ${i} to ${value}`);
                }
              } else {
                console.log("No input fields found with any selector");
                return false;
              }
            } else {
              console.log(`Found ${inputFields.length} input fields with optimization selector`);
              
              // Apply parameters sequentially
              for (let i = 0; i < Math.min(parameterValues.length, inputFields.length); i++) {
                const inputField = inputFields[i];
                const value = parameterValues[i];
                
                // Use the ChangeTvInput approach
                changeTvInput(inputField, value);
                console.log(`Set input field ${i} to ${value}`);
              }
            }
            
            // Find and click the OK button
            setTimeout(() => {
              // Try to find the OK button
              let okButton = document.querySelector("button[data-name='submit-button' i]");
              if (okButton == null) {
                okButton = document.querySelector("span[class*='submit' i] button");
              }
              
              // If still not found, try alternative selectors
              if (okButton == null) {
                okButton = findOkButton();
              }
              
              if (okButton) {
                console.log("OK button found, clicking");
                okButton.click();
              } else {
                console.log("Could not find OK button");
              }
            }, 500);
            
            return true;
          }
          
          function changeTvInput(input, value) {
            const event = new Event('input', { bubbles: true });
            const previousValue = input.value;
            
            input.value = value;
            
            // Only use valueTracker if it exists (it's a React internal)
            if (input._valueTracker) {
              input._valueTracker.setValue(previousValue);
            }
            
            input.dispatchEvent(event);
            
            // Also dispatch change event
            input.dispatchEvent(new Event('change', { bubbles: true }));
          }
          
          function findOkButton() {
            // Try different methods to find the OK button
            const buttonSelectors = [
              'button[name="submit"]',
              'button[data-name="submit"]',
              'button.tv-button--primary',
              'button.submit-button',
              'button.ok-button',
              'button.apply-button'
            ];
            
            for (const selector of buttonSelectors) {
              const button = document.querySelector(selector);
              if (button) return button;
            }
            
            // Try to find by text content
            const allButtons = document.querySelectorAll('button');
            for (const button of allButtons) {
              const text = button.textContent.toLowerCase();
              if (text === 'ok' || text === 'apply' || text === 'save') {
                return button;
              }
            }
            
            return null;
          }
        },
        args: [{ 
          symbolData: { symbol, exchange }, 
          parameterValues: parameterValues 
        }]
      });
      
      return true;
    } catch (error) {
      console.error("Error selecting symbol and setting parameters:", error);
      return false;
    }
  }
  
  // Refresh favorites table with data from storage
  function refreshFavsTable() {
    chrome.storage.local.get("favoriteSymbols", (result) => {
      const favorites = result.favoriteSymbols || [];
      
      // Format data for table
      const tableData = favorites.map(fav => {
        return {
          id: fav.id,
          symbol: fav.symbol,
          exchange: fav.exchange || '-',
          parameters: fav.parameters || '-',
          actions: ''  // This will be formatted by the table formatter
        };
      });
      
      // Update table
      $('#favs-table').bootstrapTable('load', tableData);
    });
  }
  
  // Delete favorite symbol from storage
  function deleteFavoriteSymbol(id) {
    chrome.storage.local.get("favoriteSymbols", (result) => {
      const favorites = result.favoriteSymbols || [];
      const updatedFavorites = favorites.filter(fav => fav.id !== id);
      
      chrome.storage.local.set({ "favoriteSymbols": updatedFavorites }, () => {
        refreshFavsTable();
      });
    });
  }