// ==========================================
// SECURITY GATEKEEPER
// ==========================================
(function() {
    // 1. Check if we are on the Login Page (index.html or auth.html)
    const path = window.location.pathname;
    const isLoginPage = path.includes('index.html') || path.includes('auth.html') || path === '/';

    // 2. Check if User is Logged In
    const userPin = localStorage.getItem("userPIN"); // OR "user_pin" depending on your storage key

    // 3. Logic:
    // If we are NOT on the login page AND we don't have a PIN...
    if (!isLoginPage && !userPin) {
        console.warn("Unauthorized Access! Redirecting...");
        window.location.href = "index.html"; // Kick them out!
    }
})();

console.log("Script Loaded - V18 (Redirect Fixed)");

// script.js
import { db, auth } from "./firebase-config.js";
import { doc, setDoc, getDoc } from "https://www.gstatic.com/firebasejs/9.6.1/firebase-firestore.js";
import { createUserWithEmailAndPassword, signInWithEmailAndPassword } from "https://www.gstatic.com/firebasejs/9.6.1/firebase-auth.js";

// Rest of your startAnalysis, handleSignup, and handleLogin functions...
// (Ensure you remove the old initializeApp calls inside this file)


// ===============================================
// 1. ANALYTICS LOGIC
// ===============================================

function calculateSubjectStats(leaderboard, myPin) {
    const subjectsMap = {}; 

    leaderboard.forEach(student => {
        if(student.raw_report && Array.isArray(student.raw_report)) {
            student.raw_report.forEach(sub => {
                const name = sub.SubjectName;
                const marks = parseFloat(sub.SubjectTotal || 0);
                
                if(!subjectsMap[name]) subjectsMap[name] = { all_marks: [], mine: 0 };
                
                if(marks > 0) subjectsMap[name].all_marks.push(marks);
                if(student.pin === myPin) subjectsMap[name].mine = marks;
            });
        }
    });

    const stats = [];
    for(const [name, data] of Object.entries(subjectsMap)) {
        if(data.all_marks.length > 0) {
            const sum = data.all_marks.reduce((a,b)=>a+b, 0);
            stats.push({
                name: name,
                top: Math.max(...data.all_marks),
                low: Math.min(...data.all_marks),
                avg: (sum / data.all_marks.length).toFixed(1),
                mine: data.mine
            });
        }
    }
    return stats;
}

window.startAnalysis = async function() {
    const pin = document.getElementById('pinInput').value.trim().toUpperCase();
    if(!pin) return alert("Enter PIN");

    // UI Transition to Loading
    document.getElementById('inputView').classList.add('hidden');
    document.getElementById('loadingView').classList.remove('hidden');
    document.getElementById('loadingView').style.opacity = '1';

    let progress = 0;
    const bar = document.getElementById('barFill');
    const txt = document.getElementById('percentText');
    const ring = document.getElementById('ring');
    const status = document.getElementById('statusLabel');

    const interval = setInterval(() => {
        if(progress < 95) { // Slow down near the end until API responds
            progress += 0.5;
            const offset = 565 - (progress / 100) * 565;
            ring.style.strokeDashoffset = offset;
            bar.style.width = progress + '%';
            txt.innerHTML = Math.floor(progress) + '<span>%</span>';
            if(progress > 20) status.innerText = "Connecting to SBTET Server...";
            if(progress > 60) status.innerText = "Extracting Academic Data...";
        }
    }, 50);

    try {
        const response = await fetch('/api/analyze', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ pin: pin })
        });

        const json = await response.json();

        // --- THE BIG FIX: DATA VERIFICATION ---
        // 1. Check if the response is actually okay
        // 2. Verify that the leaderboard is not empty
        // 3. Ensure "me_smart" contains actual SGPA data
        if(response.ok && json.status === "success" && json.data.leaderboard.length > 0) {
            
            const data = json.data;
            const me = data.me_smart;
            const leaderboard = data.leaderboard;
            
            // --- CALCULATION LOGIC (Local Only) ---
            const sgpas = leaderboard.map(s => s.sgpa).filter(v => v > 0);
            const classStats = {
                top: Math.max(...sgpas),
                low: Math.min(...sgpas),
                avg: (sgpas.reduce((a,b)=>a+b,0)/sgpas.length).toFixed(2)
            };

            const subStats = calculateSubjectStats(leaderboard, pin);

            // --- NO FIREBASE FOR MARKS ---
            // We skip saving results to Firebase to keep your data live and private.

            // Save to LocalStorage for Dashboard UI
            localStorage.setItem("user_pin", pin);
            localStorage.setItem("leaderboard_data", JSON.stringify(leaderboard));
            localStorage.setItem("my_detailed_history", JSON.stringify(data.me_history_detailed));
            localStorage.setItem("class_stats", JSON.stringify(classStats));
            localStorage.setItem("my_sgpa", me.sgpa);
            localStorage.setItem("subject_stats", JSON.stringify(subStats)); 

            // Completion Animation
            clearInterval(interval);
            ring.style.strokeDashoffset = 0;
            bar.style.width = '100%';
            txt.innerHTML = '100<span>%</span>';
            status.innerText = "Data Verified!";
            
            setTimeout(() => window.location.href = "dashboard.html", 800);

        } else {
            // IF API FAILS OR DATA IS EMPTY
            clearInterval(interval);
            alert("Verification Failed: SBTET API returned no marks for this PIN. Please check your PIN or Proxy connection.");
            location.reload(); // Returns to PIN input safely
        }

    } catch (e) {
        clearInterval(interval);
        console.error(e);
        alert("CRITICAL ERROR: Could not reach the Analysis API. Ensure proxy.py is running via start.sh.");
        location.reload();
    }
};


// --- DASHBOARD LOADER ---
if(window.location.pathname.includes('dashboard.html')) {
    const pin = localStorage.getItem("user_pin");
    const statsRaw = localStorage.getItem("class_stats");
    const mySgpa = localStorage.getItem("my_sgpa");

    if(pin) {
        if(statsRaw) {
            const stats = JSON.parse(statsRaw);
            const mine = parseFloat(mySgpa) || 0;
            if(window.drawBarGraph) {
                window.drawBarGraph(stats.top, stats.avg, stats.low, mine);
            }
        }
        getDoc(doc(db, "class_results", pin)).then(docSnap => {
            if(docSnap.exists()) {
                const d = docSnap.data();
                if(document.querySelector('.student-details h2'))
                    document.querySelector('.student-details h2').innerText = d.name;
                if(document.querySelector('.student-details p'))
                    document.querySelector('.student-details p').innerText = d.pin + " | " + d.branch;
                const statBoxes = document.querySelectorAll('.stat-box h3');
                if(statBoxes.length > 0) {
                    statBoxes[0].innerText = d.avg_sgpa;
                    statBoxes[1].innerText = d.credits;
                }
            }
        });
    } else {
        window.location.href = "pin.html"; // Redirect to auth if no pin
    }
}

// ===============================================
// 2. AUTHENTICATION LOGIC (UPDATED)
// ===============================================

// --- SIGN UP ---
window.handleSignup = async function(e) {
    e.preventDefault();
    
    const name = document.getElementById('regName').value;
    const email = document.getElementById('regEmail').value;
    const pin = document.getElementById('regPin').value.toUpperCase().trim(); 
    const phone = document.getElementById('regPhone').value;
    const pass = document.getElementById('regPass').value;

    const btn = document.querySelector('#signUpForm button');
    btn.innerText = "Creating Account...";
    btn.disabled = true;

    try {
        const userCredential = await createUserWithEmailAndPassword(auth, email, pass);
        const user = userCredential.user;

        await setDoc(doc(db, "users", pin), {
            uid: user.uid,
            name: name,
            email: email,
            phone: phone,
            pin: pin,
            createdAt: new Date().toISOString()
        });

        alert("Account Created! Please Sign In.");
        window.location.reload();

    } catch (error) {
        console.error(error);
        alert("Error: " + error.message);
        btn.innerText = "Sign Up";
        btn.disabled = false;
    }
};

// --- SIGN IN ---
window.handleLogin = async function(e) {
    e.preventDefault();

    const pin = document.getElementById('loginUser').value.toUpperCase().trim();
    const pass = document.getElementById('loginPass').value;
    const btn = document.querySelector('#signInForm button');
    
    btn.innerText = "Checking...";
    btn.disabled = true;

    try {
        const userDocRef = doc(db, "users", pin);
        const docSnap = await getDoc(userDocRef);

        if (!docSnap.exists()) {
            throw new Error("PIN not registered. Please Sign Up first.");
        }

        const userData = docSnap.data();
        const email = userData.email;

        await signInWithEmailAndPassword(auth, email, pass);

        // Save Session Data
        localStorage.setItem("userPIN", pin);
        localStorage.setItem("userName", userData.name);
        
        // --- FIX: Redirect to PIN Analysis first, not Dashboard ---
        window.location.href = "pin.html"; 

    } catch (error) {
        console.error(error);
        alert("Login Failed: " + error.message);
        btn.innerText = "Sign In";
        btn.disabled = false;
    }
};
// ... (Your existing code above) ...

// --- AUTO-RUN LOGIC ---
// This checks if we are on the Marketplace page and runs the loader automatically
if (document.getElementById('marketContainer')) {
    console.log("Marketplace container found, loading items...");
    window.loadMarketplace();
}
