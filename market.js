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

import { initializeApp } from "https://www.gstatic.com/firebasejs/9.6.1/firebase-app.js";
import { getFirestore, collection, addDoc, getDocs, getDoc, doc, query, where, orderBy, serverTimestamp } from "https://www.gstatic.com/firebasejs/9.6.1/firebase-firestore.js";
import { createClient } from 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js/+esm';

// --- CONFIGURATION ---
const firebaseConfig = {
  apiKey: "AIzaSyDpN_1iAlE6K7YEeKOt5fMnPqMo5eNodBM",
  authDomain: "student-data-analysis-85831.firebaseapp.com",
  projectId: "student-data-analysis-85831",
  storageBucket: "student-data-analysis-85831.firebasestorage.app",
  messagingSenderId: "739540856409",
  appId: "1:739540856409:web:155e5d3efb17211aff8b48",
  measurementId: "G-Y0VK71KDB1"
};

const supabaseUrl = 'https://zgkjmnoqnbtfcyrifjai.supabase.co';
const supabaseKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Inpna2ptbm9xbmJ0ZmN5cmlmamFpIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Njk1MjkyMDQsImV4cCI6MjA4NTEwNTIwNH0.p4M5L5XrNwPfYZ78uiHYqbnMyW80vca1p0Ua-_g88x4';

const app = initializeApp(firebaseConfig);
const db = getFirestore(app);
const supabase = createClient(supabaseUrl, supabaseKey);

const currentUserPIN = localStorage.getItem("userPIN");
const currentUserName = localStorage.getItem("userName");

// --- UTILS ---
function dataURLtoBlob(dataurl) {
    var arr = dataurl.split(','), mime = arr[0].match(/:(.*?);/)[1],
        bstr = atob(arr[1]), n = bstr.length, u8arr = new Uint8Array(n);
    while(n--){ u8arr[n] = bstr.charCodeAt(n); }
    return new Blob([u8arr], {type:mime});
}

async function compressImage(file) {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.readAsDataURL(file);
        reader.onload = (event) => {
            const img = new Image();
            img.src = event.target.result;
            img.onload = () => {
                const canvas = document.createElement('canvas');
                const MAX_WIDTH = 1000; 
                const scaleSize = MAX_WIDTH / img.width;
                canvas.width = MAX_WIDTH;
                canvas.height = img.height * scaleSize;
                const ctx = canvas.getContext('2d');
                ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
                resolve(canvas.toDataURL('image/jpeg', 0.7));
            }
            img.onerror = (e) => reject("Image Load Error");
        }
        reader.onerror = (e) => reject("File Read Error");
    });
}

// --- LOAD MARKETPLACE ---
window.loadMarketplace = async function() {
    const container = document.getElementById('marketContainer');
    if(!container) return;
    
    container.innerHTML = '<div style="padding:20px;text-align:center;color:#888"><i class="fa-solid fa-circle-notch fa-spin"></i> Loading...</div>';
    
    try {
        const q = query(
            collection(db, "market_items"), 
            where("status", "==", "approved"), 
            orderBy("timestamp", "desc")
        );

        const querySnapshot = await getDocs(q);
        
        container.innerHTML = '';
        if (querySnapshot.empty) {
            container.innerHTML = '<p style="text-align:center; color:#888;">No items found.</p>';
            return;
        }

        querySnapshot.forEach((doc) => {
            const item = doc.data();
            const card = document.createElement('div');
            card.className = 'item-card';
            card.onclick = () => window.location.href = `contact.html?id=${doc.id}`; 
            
            card.innerHTML = `
                <div class="item-img-box">
                    <img src="${item.image_url}" onerror="this.src='https://via.placeholder.com/150?text=No+Image'">
                    <div class="price-tag">₹${item.price}</div>
                </div>
                <div class="item-info">
                    <div class="item-title">${item.title}</div>
                    <div class="item-loc">@${item.seller_name}</div>
                </div>
            `;
            container.appendChild(card);
        });

    } catch (error) {
        console.error(error);
        if(error.code === 'failed-precondition') {
             container.innerHTML = '<p style="color:red; text-align:center;">INDEX ERROR: Check Console (F12)</p>';
        } else {
             container.innerHTML = `<p style="color:red; text-align:center;">Error: ${error.message}</p>`;
        }
    }
}

// --- SUBMIT AD ---
window.submitAd = async function() {
    if (!currentUserPIN) {
        alert("Please login first!");
        window.location.href = "auth.html";
        return;
    }

    const title = document.getElementById('prodName').value;
    const price = document.getElementById('prodPrice').value;
    const category = document.getElementById('selectedCategory').value;
    const desc = document.getElementById('prodDesc').value;
    const type = document.querySelector('.rent-mode') ? 'Rent' : 'Sell';
    const fileInput = document.getElementById('fileInput');

    if(!title || !price || !category || !fileInput.files[0]) {
        alert("Please fill all fields and add an image.");
        return;
    }

    const submitBtn = document.querySelector('.btn-submit');
    submitBtn.innerText = "Processing...";
    submitBtn.disabled = true;

    try {
        // 1. Get Phone
        const userDocRef = doc(db, "users", currentUserPIN);
        const userSnap = await getDoc(userDocRef);
        let sellerPhone = userSnap.exists() ? (userSnap.data().phone || "") : "";

        // 2. Upload to Supabase
        submitBtn.innerText = "Uploading Image...";
        const compressedBase64 = await compressImage(fileInput.files[0]);
        const imageBlob = dataURLtoBlob(compressedBase64);
        const fileName = `${currentUserPIN}_${Date.now()}.jpg`;

        const { data, error } = await supabase.storage
            .from('market-images')
            .upload(fileName, imageBlob, { contentType: 'image/jpeg' });

        if (error) throw new Error("Supabase Upload Failed: " + error.message);

        // 3. Get URL
        const { data: publicURLData } = supabase.storage
            .from('market-images')
            .getPublicUrl(fileName);
        
        // 4. Save to Firebase
        submitBtn.innerText = "Saving...";
        await addDoc(collection(db, "market_items"), {
            title: title,
            price: Number(price),
            category: category,
            type: type,
            description: desc,
            image_url: publicURLData.publicUrl,
            seller_pin: currentUserPIN,
            seller_name: currentUserName || "Student",
            seller_phone: sellerPhone,
            status: "pending",
            timestamp: serverTimestamp()
        });

        document.getElementById('successModal').style.display = 'flex';
        submitBtn.innerText = "SUBMIT AD";
        submitBtn.disabled = false;

    } catch (error) {
        console.error("Error:", error);
        alert("Error: " + error.message);
        submitBtn.innerText = "Try Again";
        submitBtn.disabled = false;
    }
}

// --- AUTO-START LOGIC ---
// This ensures the loader runs immediately on the Marketplace page
if (document.getElementById('marketContainer')) {
    window.loadMarketplace();
}
