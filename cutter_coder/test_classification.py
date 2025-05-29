#!/usr/bin/env python3
from shapely.geometry import Polygon
import matplotlib.pyplot as plt
import matplotlib.patches as patches

# Example: A part with two holes
# Outer rectangle
outer_points = [(0, 0), (100, 0), (100, 50), (0, 50), (0, 0)]
outer_poly = Polygon(outer_points)

# Hole 1 (small circle approximated as polygon)
import numpy as np
angles = np.linspace(0, 2*np.pi, 20)
hole1_points = [(20 + 5*np.cos(a), 25 + 5*np.sin(a)) for a in angles]
hole1_poly = Polygon(hole1_points)

# Hole 2 (rectangle)
hole2_points = [(60, 15), (80, 15), (80, 35), (60, 35), (60, 15)]
hole2_poly = Polygon(hole2_points)

# Test containment
print("Classification Test:")
print(f"Outer area: {outer_poly.area:.1f}")
print(f"Hole1 area: {hole1_poly.area:.1f}")
print(f"Hole2 area: {hole2_poly.area:.1f}")
print()
print(f"Is hole1 inside outer? {outer_poly.contains(hole1_poly)}")
print(f"Is hole2 inside outer? {outer_poly.contains(hole2_poly)}")
print(f"Is outer inside hole1? {hole1_poly.contains(outer_poly)}")

# Create visualization
fig, ax = plt.subplots(1, 1, figsize=(10, 6))

# Draw outer contour
outer_patch = patches.Polygon(outer_points, fill=False, edgecolor='blue', linewidth=2, label='Part (Outer)')
ax.add_patch(outer_patch)

# Draw holes
hole1_patch = patches.Polygon(hole1_points, fill=False, edgecolor='red', linewidth=2, label='Hole 1')
ax.add_patch(hole1_patch)

hole2_patch = patches.Polygon(hole2_points, fill=False, edgecolor='red', linewidth=2, linestyle='--', label='Hole 2')
ax.add_patch(hole2_patch)

# Add labels
ax.text(50, 25, 'PART', ha='center', va='center', fontsize=16, color='blue')
ax.text(20, 25, 'HOLE', ha='center', va='center', fontsize=10, color='red')
ax.text(70, 25, 'HOLE', ha='center', va='center', fontsize=10, color='red')

# Show cutting direction arrows
# Outside: Climb milling (CCW)
ax.annotate('', xy=(50, 0), xytext=(30, 0), 
            arrowprops=dict(arrowstyle='->', color='blue', lw=2))
ax.text(40, -5, 'CCW (Climb)', ha='center', color='blue')

# Inside: Conventional (CW)
ax.annotate('', xy=(65, 35), xytext=(75, 35), 
            arrowprops=dict(arrowstyle='->', color='red', lw=2))
ax.text(70, 38, 'CW', ha='center', color='red')

ax.set_xlim(-10, 110)
ax.set_ylim(-10, 60)
ax.set_aspect('equal')
ax.grid(True, alpha=0.3)
ax.legend()
ax.set_title('Outside vs Inside Classification')

plt.tight_layout()
plt.savefig('/tmp/classification.png', dpi=150)
print("\nVisualization saved to /tmp/classification.png")