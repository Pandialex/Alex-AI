
let inputfield = document.querySelector('.ask')
let responsecontainer = document.querySelector('.response-container')
let questionasked = document.querySelector('.question-asked p')
let responsetext = document.querySelector('.response-text p')



async function chatgptclone(query) {
    

    questionasked.textContent = query
    responsetext.textContent = "Thinking......."
    responsecontainer.classList.remove('display-none')

     let response = await fetch(
        'https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=AIzaSyDi1LrWUeVWtadIWDdnF3I_qjcHZWbgrPA',
        {
            method: "POST",
            headers: { "Content-Type": "application/json" }, // fixed typo: 'header' → 'headers'
            body: JSON.stringify({
                contents: [{ parts: [{ text: query }] }]
            })
        }
    );

    let data = await response.json();
    responsetext.textContent = data.candidates[0].content.parts[0].text
}

inputfield.addEventListener("keydown", function(e){
    if(e.key === "Enter" && inputfield.value.trim() !== ""){
        chatgptclone(inputfield.value.trim())
        inputfield.value = ""
    }
})