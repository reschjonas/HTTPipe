// Define debounce function to improve performance
function debounce(func, wait) {
    let timeout;
    return function(...args) {
        clearTimeout(timeout);
        timeout = setTimeout(() => func.apply(this, args), wait);
    };
}

window.addEventListener('pywebviewready', function() {
    // DOM Element References
    const filePathInput = document.getElementById('file-path');
    const selectFileBtn = document.getElementById('select-file-btn');
    const ipAddressSelect = document.getElementById('ip-address-select');
    const ipAddressCustomInput = document.getElementById('ip-address-custom');
    const portInput = document.getElementById('port');
    const startServerBtn = document.getElementById('start-server-btn');
    const stopServerBtn = document.getElementById('stop-server-btn');
    const serverStatusSpan = document.getElementById('server-status');
    const downloadCommandPre = document.getElementById('download-command');
    const copyCommandBtn = document.getElementById('copy-command-btn');
    const notificationArea = document.getElementById('notification-area');
    const convertBase64Btn = document.getElementById('convert-base64-btn');
    const base64DecodeCmd = document.getElementById('base64-decode-cmd');
    const base64OutputContainer = document.getElementById('base64-output-container');
    const base64Output = document.getElementById('base64-output');
    const base64DecodeCommand = document.getElementById('base64-decode-command');
    const copyBase64Btn = document.getElementById('copy-base64-btn');
    const splitFileBtn = document.getElementById('split-file-btn');
    const splitSize = document.getElementById('split-size');
    const splitResults = document.getElementById('split-results');
    const chunkList = document.getElementById('chunk-list');
    const chunkReassemblyCmd = document.getElementById('chunk-reassembly-cmd');
    const copyReassemblyCmd = document.getElementById('copy-reassembly-cmd');

    // Tab navigation elements
    const tabButtons = document.querySelectorAll('.tab-button');
    const tabContents = document.querySelectorAll('.tab-content');

    // Single command copy buttons
    const copySingleButtons = document.querySelectorAll('.copy-single-btn');

    // State variables
    let selectedFilePath = null; // Store the full path
    let currentFilename = null; // Store just the filename for command generation
    let isServerRunning = false;
    let commandsGenerated = false;
    let notificationTimeout = null;
    let base64Data = null;
    let chunksCreated = [];
    let currentNotifications = [];
    let commandsLimit = 5; // Limit number of commands shown to prevent lag
    let activeTabId = 'download'; // Track the active tab

    // Enhanced notification function with queueing and improved performance
    function showNotification(message, type = 'success', duration = 3000) {
        // Limit number of notifications to 3 at a time for performance
        if (currentNotifications.length >= 3) {
            const oldNotification = currentNotifications.shift();
            oldNotification.remove();
        }
        
        // Create notification element
        const notification = document.createElement('div');
        notification.className = `notification ${type}`;
        
        // Add icon based on type
        let icon = 'check-circle';
        if (type === 'error') icon = 'exclamation-circle';
        else if (type === 'warning') icon = 'exclamation-triangle';
        
        notification.innerHTML = `<i class="fas fa-${icon}"></i> ${message}`;
        
        // Add to DOM
        notificationArea.appendChild(notification);
        
        // Add to tracking array
        currentNotifications.push(notification);
        
        // Add show class after brief delay (for animation)
        setTimeout(() => { notification.classList.add('show'); }, 10); 

        // Remove after duration
        setTimeout(() => {
            notification.classList.remove('show');
            setTimeout(() => { 
                if (notification.parentNode) {
                    notification.remove();
                }
                // Remove from tracking array
                const index = currentNotifications.indexOf(notification);
                if (index > -1) currentNotifications.splice(index, 1);
            }, 300);
        }, duration);
    }

    // Get the currently selected/entered IP address
    function getCurrentIpAddress() {
        if (ipAddressSelect.value === 'custom') {
            return ipAddressCustomInput.value.trim();
        } else {
            return ipAddressSelect.value;
        }
    }

    // Update the displayed download command with improved formatting and performance
    function updateDownloadCommand() {
        const ip = getCurrentIpAddress();
        const port = portInput.value;
        const pythonExecutable = 'python3'; // Or 'python'
        const powershellExecutable = 'powershell.exe'; // Or 'pwsh'

        if (isServerRunning && ip && port && currentFilename) {
            const encodedFilename = encodeURIComponent(currentFilename);
            const url = `http://${ip}:${port}/${encodedFilename}`;
            const shellFilename = currentFilename.replace(/"/g, '\\"');

            // Clear previous content and set flag
            downloadCommandPre.innerHTML = '';
            commandsGenerated = true;
            
            // Create command blocks with proper syntax highlighting
            const commands = {
                curl: {
                    command: `curl -o "${shellFilename}" ${url}`,
                    icon: 'terminal',
                    color: '#3b82f6'
                },
                wget: {
                    command: `wget --output-document="${shellFilename}" ${url}`,
                    icon: 'download',
                    color: '#10b981'
                },
                python: {
                    command: `${pythonExecutable} -c "import requests; open('${shellFilename}', 'wb').write(requests.get('${url}').content)"`,
                    icon: 'code',
                    color: '#f59e0b'
                },
                powershell: {
                    command: `${powershellExecutable} -Command "Invoke-WebRequest -Uri ${url} -OutFile ${shellFilename}"`,
                    icon: 'window-maximize',
                    color: '#0369a1'
                },
                fileless: {
                    command: `curl ${url} | bash`,
                    icon: 'ghost',
                    color: '#EC4899'
                }
            };

            // Add each command with a copy button
            for (const [type, data] of Object.entries(commands)) {
                const commandBlock = document.createElement('div');
                commandBlock.className = 'command-block';

                const title = document.createElement('span');
                title.className = 'command-title';
                title.innerHTML = `<i class="fas fa-${data.icon}" style="color:${data.color}"></i> ${type.charAt(0).toUpperCase() + type.slice(1)}:`;
                commandBlock.appendChild(title);

                const code = document.createElement('code');
                code.textContent = data.command;
                commandBlock.appendChild(code);

                const copyBtn = document.createElement('button');
                copyBtn.className = 'copy-single-btn';
                copyBtn.innerHTML = '<i class="fas fa-copy"></i> Copy';
                copyBtn.title = `Copy ${type} command`;
                copyBtn.addEventListener('click', () => copySingleCommand(data.command));
                commandBlock.appendChild(copyBtn);

                downloadCommandPre.appendChild(commandBlock);
            }
            
            // Hide the main copy button as we have individual ones
            copyCommandBtn.style.display = 'none';
            
        } else if (!selectedFilePath){
            downloadCommandPre.innerHTML = '<span class="placeholder-text"><i class="fas fa-file-alt"></i> Select a file first to see download commands</span>';
            copyCommandBtn.style.display = 'block';
            copyCommandBtn.disabled = true;
            commandsGenerated = false;
        } else {
            downloadCommandPre.innerHTML = '<span class="placeholder-text"><i class="fas fa-server"></i> Start the server to see download commands</span>';
            copyCommandBtn.style.display = 'block';
            copyCommandBtn.disabled = true;
            commandsGenerated = false;
        }
    }

    // Function to copy a single command text with improved feedback
    function copySingleCommand(commandText) {
        navigator.clipboard.writeText(commandText)
            .then(() => {
                showNotification('Command copied to clipboard!', 'success', 1500);
            })
            .catch(err => {
                console.error('Failed to copy command: ', err);
                showNotification("Failed to copy command to clipboard.", 'error');
            });
    }

    // Update UI elements based on server state and file selection
    function updateUiState() {
        // Button states
        startServerBtn.disabled = isServerRunning || !selectedFilePath;
        stopServerBtn.disabled = !isServerRunning;
        selectFileBtn.disabled = isServerRunning;
        portInput.disabled = isServerRunning;
        ipAddressSelect.disabled = isServerRunning;
        ipAddressCustomInput.disabled = isServerRunning || ipAddressSelect.value !== 'custom';
        copyCommandBtn.style.display = commandsGenerated ? 'none' : 'block';
        copyCommandBtn.disabled = !commandsGenerated;
        
        // Pentest tools button states
        convertBase64Btn.disabled = !selectedFilePath;
        splitFileBtn.disabled = !selectedFilePath;

        // Update status display
        serverStatusSpan.classList.remove('running', 'stopped', 'error');
        if (isServerRunning) {
            serverStatusSpan.textContent = 'Status: Running';
            serverStatusSpan.classList.add('running');
            serverStatusSpan.classList.add('pulse');
        } else {
            serverStatusSpan.textContent = 'Status: Stopped';
            serverStatusSpan.classList.add('stopped');
            serverStatusSpan.classList.remove('pulse');
        }
        
        // Update download commands
        updateDownloadCommand();
    }
    
    // Set status to an error state
    function setStatusError(message = 'Error') {
        serverStatusSpan.classList.remove('running', 'stopped', 'pulse');
        serverStatusSpan.classList.add('error');
        serverStatusSpan.textContent = `Status: ${message}`;
        isServerRunning = false;
        updateUiState();
    }

    // Add a loading state for when actions are pending
    function setLoading(element, isLoading) {
        if (isLoading) {
            // Save original text
            element.dataset.originalText = element.innerHTML;
            // Replace with loading spinner
            element.innerHTML = '<i class="fas fa-spinner fa-spin"></i> ' + element.textContent;
            element.disabled = true;
        } else {
            // Restore original text
            if (element.dataset.originalText) {
                element.innerHTML = element.dataset.originalText;
                delete element.dataset.originalText;
            }
            // Don't enable here - let updateUiState handle that
        }
    }

    // Implement improved tab switching
    function setupTabs() {
        tabButtons.forEach(button => {
            button.addEventListener('click', () => {
                // Store the active tab ID
                activeTabId = button.getAttribute('data-tab');
                
                // Remove active class from all buttons and contents
                tabButtons.forEach(btn => btn.classList.remove('active'));
                tabContents.forEach(content => content.classList.remove('active'));
                
                // Add active class to clicked button
                button.classList.add('active');
                
                // Show corresponding content by adding the active class
                const tabContent = document.getElementById(activeTabId);
                if (tabContent) {
                    tabContent.classList.add('active');
                }
                
                // If switching back to download tab, refresh commands
                if (activeTabId === 'download-commands') {
                    updateDownloadCommand();
                }
            });
        });
    }

    // Setup copy buttons for shell commands
    function setupCopyButtons() {
        copySingleButtons.forEach(button => {
            button.addEventListener('click', function() {
                const commandText = this.getAttribute('data-cmd');
                if (commandText) {
                    copySingleCommand(commandText);
                }
            });
        });
    }

    // Implement base64 conversion with optimized display handling
    function setupBase64Conversion() {
        convertBase64Btn.addEventListener('click', function() {
            if (!selectedFilePath) {
                showNotification("Please select a file first", 'warning');
                return;
            }
            
            setLoading(this, true);
            base64OutputContainer.classList.add('hidden');
            
            window.pywebview.api.file_to_base64(selectedFilePath).then(function(response) {
                setLoading(convertBase64Btn, false);
                
                if (response && response.success) {
                    base64Data = response.data;
                    const filename = response.filename;
                    
                    // Update output container - only show preview of base64 data
                    if (base64Data.length > 1000) {
                        // Only show partial data to improve performance
                        base64Output.textContent = base64Data.substring(0, 500) + 
                            '\n[... data truncated for display purposes ...]\n' + 
                            base64Data.substring(base64Data.length - 500);
                    } else {
                        base64Output.textContent = base64Data;
                    }
                    
                    // Update decode command based on selected decoder, including actual data
                    updateBase64DecodeCommand(filename, base64Data);
                    
                    // Show output container
                    base64OutputContainer.classList.remove('hidden');
                    
                    showNotification(`File encoded to base64 (${formatBytes(response.size)})`, 'success');
                } else {
                    const errorMsg = response && response.error ? response.error : "Unknown error";
                    showNotification(`Base64 encoding failed: ${errorMsg}`, 'error', 5000);
                }
            }).catch(err => {
                setLoading(convertBase64Btn, false);
                console.error("Error calling file_to_base64 API:", err);
                showNotification('Communication error with backend', 'error', 5000);
            });
        });
        
        base64DecodeCmd.addEventListener('change', function() {
            if (base64Data && currentFilename) {
                updateBase64DecodeCommand(currentFilename, base64Data);
            }
        });
        
        copyBase64Btn.addEventListener('click', function() {
            const decodeCommand = base64DecodeCommand.textContent;
            if (decodeCommand) {
                copySingleCommand(decodeCommand);
            }
        });
    }
    
    // Update base64 decode command based on OS selection WITH THE ACTUAL DATA
    function updateBase64DecodeCommand(filename, data) {
        const os = base64DecodeCmd.value;
        let command = '';
        
        // If data is very large, create a command that will actually work
        const truncateLength = 200; // Characters to show of large data
        const isDataTooLarge = data && data.length > 10000;
        
        if (os === 'linux') {
            if (isDataTooLarge) {
                // For large files, provide the command structure and first/last part of data
                const previewData = data.substring(0, truncateLength) + '...' + 
                                  data.substring(data.length - truncateLength);
                command = `# Base64 data too large to display fully (${formatBytes(data.length * 0.75)})\n` +
                          `# Save this to a file first:\n` +
                          `echo '${previewData}' > encoded.b64\n` +
                          `# Then decode with:\n` +
                          `cat encoded.b64 | base64 -d > "${filename}"\n` +
                          `# The actual data starts with: ${data.substring(0, 20)}...`;
            } else {
                command = `echo '${data}' | base64 -d > "${filename}"`;
            }
        } else if (os === 'windows') {
            if (isDataTooLarge) {
                const previewData = data.substring(0, truncateLength) + '...' + 
                                  data.substring(data.length - truncateLength);
                command = `# Base64 data too large to display fully (${formatBytes(data.length * 0.75)})\n` +
                          `# 1. Save this to encoded.b64 file first\n` +
                          `# Data begins with: ${data.substring(0, 20)}...\n\n` +
                          `# 2. Then decode with:\n` +
                          `certutil -decode encoded.b64 "${filename}"\n` +
                          `del encoded.b64`;
            } else {
                command = `echo ${data} > encoded.b64\ncertutil -decode encoded.b64 "${filename}"\ndel encoded.b64`;
            }
        }
        
        base64DecodeCommand.textContent = command;
    }
    
    // Implement file chunking with optimized UI updates
    function setupFileChunking() {
        splitFileBtn.addEventListener('click', function() {
            if (!selectedFilePath) {
                showNotification("Please select a file first", 'warning');
                return;
            }
            
            const chunkSizeKB = parseInt(splitSize.value);
            if (isNaN(chunkSizeKB) || chunkSizeKB < 16 || chunkSizeKB > 10240) {
                showNotification("Please enter a valid chunk size (16-10240 KB)", 'warning');
                return;
            }
            
            setLoading(this, true);
            splitResults.classList.add('hidden');
            
            window.pywebview.api.split_file(selectedFilePath, chunkSizeKB).then(function(response) {
                setLoading(splitFileBtn, false);
                
                if (response && response.success) {
                    chunksCreated = response.chunks;
                    
                    // Clear previous list
                    chunkList.innerHTML = '';
                    
                    // Limit number of chunks shown for better performance
                    const displayLimit = 50; // Show at most 50 chunks
                    let chunksToShow = chunksCreated;
                    
                    if (chunksCreated.length > displayLimit) {
                        // Just show first 25 and last 25 chunks
                        const firstHalf = chunksCreated.slice(0, displayLimit / 2);
                        const secondHalf = chunksCreated.slice(chunksCreated.length - displayLimit / 2);
                        chunksToShow = [...firstHalf, ...secondHalf];
                        
                        // Add ellipsis to indicate truncation
                        const totalHidden = chunksCreated.length - displayLimit;
                        const ellipsisItem = document.createElement('li');
                        ellipsisItem.textContent = `... ${totalHidden} more chunks ...`;
                        ellipsisItem.className = 'truncated-chunk-notice';
                        
                        // Add each chunk to the list with batch rendering
                        const fragment = document.createDocumentFragment();
                        
                        firstHalf.forEach(chunk => {
                            const li = document.createElement('li');
                            li.textContent = `${chunk.name} (${formatBytes(chunk.size)})`;
                            fragment.appendChild(li);
                        });
                        
                        fragment.appendChild(ellipsisItem);
                        
                        secondHalf.forEach(chunk => {
                            const li = document.createElement('li');
                            li.textContent = `${chunk.name} (${formatBytes(chunk.size)})`;
                            fragment.appendChild(li);
                        });
                        
                        chunkList.appendChild(fragment);
                    } else {
                        // Batch render all chunks for better performance
                        const fragment = document.createDocumentFragment();
                        chunksToShow.forEach(chunk => {
                            const li = document.createElement('li');
                            li.textContent = `${chunk.name} (${formatBytes(chunk.size)})`;
                            fragment.appendChild(li);
                        });
                        chunkList.appendChild(fragment);
                    }
                    
                    // Create reassembly command
                    const filename = response.original_file;
                    const isWindows = navigator.platform.indexOf('Win') !== -1;
                    let command = '';
                    
                    if (isWindows) {
                        command = `copy /b "${filename}.001" + "${filename}.002" + ... "${filename}"`;
                    } else {
                        command = `cat ${filename}.* > ${filename}`;
                    }
                    
                    chunkReassemblyCmd.textContent = command;
                    
                    // Show results
                    splitResults.classList.remove('hidden');
                    
                    showNotification(`File split into ${chunksCreated.length} chunks`, 'success');
                } else {
                    const errorMsg = response && response.error ? response.error : "Unknown error";
                    showNotification(`File chunking failed: ${errorMsg}`, 'error', 5000);
                }
            }).catch(err => {
                setLoading(splitFileBtn, false);
                console.error("Error calling split_file API:", err);
                showNotification('Communication error with backend', 'error', 5000);
            });
        });
        
        copyReassemblyCmd.addEventListener('click', function() {
            const command = chunkReassemblyCmd.textContent;
            if (command) {
                copySingleCommand(command);
            }
        });
    }

    // Format bytes to human-readable size
    function formatBytes(bytes, decimals = 2) {
        if (bytes === 0) return '0 Bytes';
        
        const k = 1024;
        const dm = decimals < 0 ? 0 : decimals;
        const sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB'];
        
        const i = Math.floor(Math.log(bytes) / Math.log(k));
        
        return parseFloat((bytes / Math.pow(k, i)).toFixed(dm)) + ' ' + sizes[i];
    }

    // Use debounce for input events to improve performance
    const debouncedUpdateCommand = debounce(updateDownloadCommand, 100);

    // Populate IP addresses on load
    window.pywebview.api.get_ip_addresses().then(function(ips) {
        // Clear loading message
        ipAddressSelect.innerHTML = '';
        
        // Add default 127.0.0.1
        const defaultOption = document.createElement('option');
        defaultOption.value = '127.0.0.1';
        defaultOption.textContent = '127.0.0.1 (Localhost)';
        ipAddressSelect.appendChild(defaultOption);

        if (ips && ips.length > 0) {
            ips.forEach(ip => {
                if (ip !== '127.0.0.1') {
                    const option = document.createElement('option');
                    option.value = ip;
                    option.textContent = ip;
                    ipAddressSelect.appendChild(option);
                }
            });
        }
        
        // Add custom option
        const customOption = document.createElement('option');
        customOption.value = 'custom';
        customOption.textContent = 'Enter Custom IP...';
        ipAddressSelect.appendChild(customOption);

        // Set default selection to first non-loopback if available
        const firstNonLoopback = ips ? ips.find(ip => ip !== '127.0.0.1') : null;
        if (firstNonLoopback) {
            ipAddressSelect.value = firstNonLoopback;
        } else {
            ipAddressSelect.value = '127.0.0.1';
        }

        // Hide custom input initially
        ipAddressCustomInput.style.display = 'none';
        updateUiState();
    }).catch(err => {
        console.error("Error getting IP addresses:", err);
        ipAddressSelect.innerHTML = '';
        
        // Add placeholder option
        const errorOption = document.createElement('option');
        errorOption.value = '127.0.0.1';
        errorOption.textContent = '127.0.0.1 (Network error)';
        ipAddressSelect.appendChild(errorOption);
        
        // Add custom option
        const customOption = document.createElement('option');
        customOption.value = 'custom';
        customOption.textContent = 'Enter Custom IP...';
        ipAddressSelect.appendChild(customOption);
        
        showNotification('Could not load network interfaces', 'error');
        updateUiState();
    });

    // Listener for IP Select Dropdown
    ipAddressSelect.addEventListener('change', function() {
        if (this.value === 'custom') {
            ipAddressCustomInput.style.display = 'block';
            ipAddressCustomInput.focus();
        } else {
            ipAddressCustomInput.style.display = 'none';
        }
        debouncedUpdateCommand();
    });

    // Listener for Custom IP Input
    ipAddressCustomInput.addEventListener('input', debouncedUpdateCommand);

    selectFileBtn.addEventListener('click', function() {
        setLoading(this, true);
        window.pywebview.api.select_file().then(function(selectedPath) {
            setLoading(selectFileBtn, false);
            if (selectedPath) {
                 selectedFilePath = selectedPath;
                 currentFilename = selectedPath.split(/[\\/]/).pop();
                 filePathInput.value = selectedFilePath;
                 console.log(`File selected: ${selectedFilePath}, Filename: ${currentFilename}`);
                 showNotification(`Selected file: ${currentFilename}`, 'success');
                 updateUiState();
            } else {
                 console.log("File selection cancelled or failed.");
                 selectedFilePath = null;
                 currentFilename = null;
                 filePathInput.value = "";
                 updateUiState();
            }
        }).catch(err => {
            setLoading(selectFileBtn, false);
            console.error("Error calling select_file API:", err);
            showNotification('Error opening file dialog', 'error');
            selectedFilePath = null;
            currentFilename = null;
            filePathInput.value = "";
            updateUiState();
        });
    });

    startServerBtn.addEventListener('click', function() {
        const currentIP = getCurrentIpAddress(); 
        const port = portInput.value;
        
        if (!selectedFilePath) {
            showNotification("Please select a file first", 'warning');
            return;
        }
        
        if (ipAddressSelect.value === 'custom' && !currentIP) {
             showNotification("Please enter a custom IP address", 'warning');
             return;
        }
        
        if (ipAddressSelect.value === 'custom' && !/^(\d{1,3}\.){3}\d{1,3}$/.test(currentIP) && currentIP !== "localhost") {
            showNotification("Invalid IP address format", 'error');
            return;
        }

        if (!port || port < 1 || port > 65535) {
            showNotification("Please enter a valid port (1-65535)", 'error');
            return;
        }

        // Show loading state
        setLoading(this, true);
        serverStatusSpan.textContent = 'Status: Starting...';
        serverStatusSpan.classList.remove('stopped', 'running', 'error');
        serverStatusSpan.classList.add('running', 'pulse');

        window.pywebview.api.start_server(selectedFilePath, port).then(function(response) {
            setLoading(startServerBtn, false);
            
            if (response && response.success) {
                isServerRunning = true;
                currentFilename = response.filename;
                updateUiState();
                // Success notification with IP:port info
                const ip = getCurrentIpAddress();
                showNotification(`Server running at ${ip}:${port}`, 'success');
                console.log(`Server started successfully serving ${currentFilename} from ${response.directory} on port ${response.port}`);
            } else {
                isServerRunning = false;
                const errorMsg = response && response.error ? response.error : "Unknown error";
                setStatusError('Failed');
                showNotification(`Server failed to start: ${errorMsg}`, 'error', 5000);
                console.error(`Failed to start server: ${errorMsg}`);
                updateUiState();
            }
        }).catch(err => {
             setLoading(startServerBtn, false);
             isServerRunning = false;
             setStatusError('Error');
             showNotification('Communication error with backend', 'error', 5000);
             console.error("Error calling start_server API:", err);
             updateUiState();
        });
    });

    stopServerBtn.addEventListener('click', function() {
        setLoading(this, true);
        serverStatusSpan.textContent = 'Status: Stopping...';
        
        window.pywebview.api.stop_server().then(function(response) {
            setLoading(stopServerBtn, false);
            
            if (response && response.success) {
                isServerRunning = false;
                updateUiState();
                showNotification('Server stopped successfully', 'success');
                
                if(response.warning) {
                    showNotification(response.warning, 'warning', 5000);
                }
            } else {
                isServerRunning = false;
                const errorMsg = response && response.error ? response.error : "Unknown error";
                setStatusError('Stop Failed');
                showNotification(`Failed to stop server cleanly: ${errorMsg}`, 'error', 5000);
                updateUiState();
            }
        }).catch(err => {
            setLoading(stopServerBtn, false);
            isServerRunning = false;
            setStatusError('Error');
            showNotification('Communication error with backend', 'error', 5000);
            console.error("Error calling stop_server API:", err);
            updateUiState();
        });
    });

    // Add event listeners with debounce for better performance
    portInput.addEventListener('change', debouncedUpdateCommand);
    portInput.addEventListener('input', debouncedUpdateCommand);

    // Setup additional features
    setupTabs();
    setupCopyButtons();
    setupBase64Conversion();
    setupFileChunking();

    // Initial setup
    updateUiState();
}); 