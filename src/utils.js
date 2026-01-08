export function displayDialogue(text, onDisplayEnd) {
    const dialogueUI = document.getElementById("textbox-container");
    const dialogue = document.getElementById("dialogue");
    const textbox = document.getElementById("textbox");

    dialogueUI.style.display = "block";

    let index = 0;
    let currentText = "";
    let isTextComplete = false;
    const intervalRef = setInterval(()=> {
        if (index < text.length) {
            currentText += text[index];
            dialogue.innerHTML = currentText;
            index++;
            return;
        }

        isTextComplete = true;
        clearInterval(intervalRef);
    }, 1);

    const closeBtn = document.getElementById("close");

    function onCloseBtnClick() {
        onDisplayEnd();
        dialogueUI.style.display = "none";
        dialogue.innerHTML = "";
        clearInterval(intervalRef);
        closeBtn.removeEventListener("click", onCloseBtnClick);
        document.removeEventListener("click", onDocumentClick);
        document.removeEventListener("keydown", onKeyDown);
    };

    function onDocumentClick(event) {
        if (!isTextComplete) return;
        if (!textbox.contains(event.target)) {
            closeBtn.click();
        }
    }

    function onKeyDown(event) {
        if (!isTextComplete) return;
        if (event.code === "Enter") {
            closeBtn.click();
        }
    }

    closeBtn.addEventListener("click", onCloseBtnClick);

    document.addEventListener("click", onDocumentClick);
    document.addEventListener("keydown", onKeyDown);
};

export function setCamScale(k) {
    const resizeFactor = k.width() / k.height();
    if (resizeFactor < 1) {
        k.camScale(k.vec2(1));
    } else {
    k.camScale(k.vec2(1.5));
    }

};
