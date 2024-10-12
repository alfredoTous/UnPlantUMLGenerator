function getGitHubApiUrl(gitHubUrl) {
    // This function will convert a regular GitHub repository URL to its API endpoint.
    const repoPath = gitHubUrl.replace(/^https:\/\/github.com\//, "");
    return `https://api.github.com/repos/${repoPath}/contents/`;
}

async function fetchJavaFiles() {
    // Clear the output before starting a new process
    document.getElementById('output').innerHTML = '';  
    const gitHubUrl = document.getElementById('repoUrl').value;
    const apiUrl = getGitHubApiUrl(gitHubUrl); // Get the correct API URL
    
    try {
        
        await fetchAndParseFiles(apiUrl, '');
        
        
        finalizeUML();
    } catch (error) {
        console.error("Error processing files: ", error);
    }
}

async function fetchAndParseFiles(baseUrl, path) {
    const fileListUrl = `${baseUrl}${path}`;
    const response = await fetch(fileListUrl);

    if (!response.ok) {
        throw new Error(`Failed to fetch ${fileListUrl}: ${response.statusText}`);
    }

    const entries = await response.json();

    for (let entry of entries) {
        if (entry.type === 'file' && entry.name.endsWith('.java')) {
            const fileResponse = await fetch(entry.download_url);
            const fileContent = await fileResponse.text();
            parseJavaFile(entry.path, fileContent);
        } else if (entry.type === 'dir') {
            await fetchAndParseFiles(baseUrl, `${entry.path}/`);
        }
    }
}
let relationsSet = new Set();
const processedClasses = new Set();
let FinalPlantUML = "@startuml\n";

function parseJavaFile(filePath, content) {
    const classRegex = /class\s+([^\s{]+)/g;
    const enumRegex = /enum\s+([^\s{]+)/g;
    const methodRegex = /(public|protected|private|static|\s)\s+[\w<>\[\]]+\s+(\w+)\s*\(([^)]*)\)/g;
    const attributeRegex = /^\s*(public|protected|private)?\s+([\w<>\[\]]+)\s+(\w+)\s*;/gm;
    const inheritanceRegex = /class\s+([^\s{]+)\s+extends\s+([^\s{]+)/;
    const interfaceRegex = /class\s+([^\s{]+)\s+implements\s+([^\s{]+)/;

    let plantUML = "";
    let relations = "";  

    let classMatch = classRegex.exec(content);
    let enumMatch = enumRegex.exec(content);

    if (enumMatch) {
        let enumName = enumMatch[1];

        if (!processedClasses.has(enumName)) {
            processedClasses.add(enumName);  
            plantUML += `enum ${enumName} {\n`;

            const enumValuesRegex = /(\w+),?/g;
            let enumValuesSection = content.slice(content.indexOf(enumName) + enumName.length);
            let valueMatch;
            while ((valueMatch = enumValuesRegex.exec(enumValuesSection)) !== null) {
                plantUML += `    ${valueMatch[1]}\n`;
            }
            plantUML += `}\n`;
        }
    }

    if (classMatch) {
        let className = classMatch[1];

        if (!processedClasses.has(className)) {
            processedClasses.add(className);  
            plantUML += `class ${className} {\n`;

            let methodPosition = content.search(methodRegex);
            let attributesSection = content.slice(0, methodPosition);

            let attributeMatch;
            while ((attributeMatch = attributeRegex.exec(attributesSection)) !== null) {
                let visibility = attributeMatch[1] || 'package';
                let attributeType = attributeMatch[2];
                let attributeName = attributeMatch[3];
                let visibilitySymbol = getVisibilitySymbol(visibility);

                if (attributeType.includes("ArrayList")) {
                    let listType = attributeType.match(/ArrayList<([^>]+)>/)[1];  
                    plantUML += `    ${visibilitySymbol}${attributeName}: ${listType} [*]\n`;  
                    relations += `${className} "1" -- "0..*" ${listType}\n`;
                } else {
                    plantUML += `    ${visibilitySymbol}${attributeName}: ${attributeType}\n`;
                    if (isClass(attributeType)) {
                        addRelation(className, attributeType); 
                    }
                }
            }

            // Reset the regex index for method search within the class
            let methodMatch;
            while ((methodMatch = methodRegex.exec(content)) !== null) {
                let visibility = methodMatch[1] || 'package';
                let methodName = methodMatch[2];
                let methodParams = methodMatch[3];

                let visibilitySymbol = getVisibilitySymbol(visibility);
                plantUML += `    ${visibilitySymbol}${methodName}(${methodParams})\n`;
            }
            plantUML += `}\n`;

            let inheritanceMatch = inheritanceRegex.exec(content);
            if (inheritanceMatch) {
                let parentClass = inheritanceMatch[2];
                relations += `${parentClass} <|-- ${className}\n`;  
            }

            let interfaceMatch = interfaceRegex.exec(content);
            if (interfaceMatch) {
                let interfaces = interfaceMatch[2].split(",");
                for (let interfaceName of interfaces) {
                    relations += `${className} ..|> ${interfaceName.trim()}\n`;  
                }
            }
        }
    }

    FinalPlantUML += plantUML + relations;
}

function getVisibilitySymbol(visibility) {
    switch (visibility) {
        case 'public':
            return '+';
        case 'private':
            return '-';
        case 'protected':
            return '#';
        default:
            return ''; 
    }
}

function addRelation(classA, classB) {
    const relationAtoB = `${classA} --> ${classB}`;
    const relationBtoA = `${classB} --> ${classA}`;
    
    if (relationsSet.has(relationBtoA)) {
        relationsSet.delete(relationBtoA);
        relationsSet.add(`${classA} <--> ${classB}`);
    } else {
        relationsSet.add(relationAtoB);
    }
}

function generateRelations() {
    let relations = '';
    for (let relation of relationsSet) {
        relations += relation + '\n';
    }
    return relations;
}

function finalizeUML() {
    const relations = generateRelations();
    FinalPlantUML += "\n" + relations;
    FinalPlantUML += "\n@enduml"; 
    let output = document.getElementById('output');
    output.innerHTML = `<pre>${FinalPlantUML}</pre>`;
}

function isClass(type) {
    const knownTypes = ['int', 'double', 'float', 'char', 'boolean', 'String', 'void'];  
    return !knownTypes.includes(type);  
}

